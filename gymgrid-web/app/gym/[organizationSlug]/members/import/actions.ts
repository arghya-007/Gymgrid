"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";

export interface ImportMemberRow {
  full_name: string;
  preferred_name: string | null;
  email: string | null;
  phone: string;
  date_of_birth: string | null;
  gender: "female" | "male" | "non_binary" | "prefer_not_to_say" | null;
  notes: string | null;
}

export interface MemberImportState {
  stage: "upload" | "preview";
  message: string;
  branchId: string;
  fileName: string;
  rows: ImportMemberRow[];
}

const headers = [
  "full_name",
  "preferred_name",
  "email",
  "phone",
  "date_of_birth",
  "gender",
  "notes",
] as const;
const genderValues = [
  "female",
  "male",
  "non_binary",
  "prefer_not_to_say",
] as const;
const maximumFileSize = 512 * 1024;
const maximumRows = 500;

function uploadError(message: string): MemberImportState {
  return { stage: "upload", message, branchId: "", fileName: "", rows: [] };
}

function cell(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseCsv(source: string) {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let afterQuote = false;
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];

    if (inQuotes) {
      if (character === '"') {
        if (normalized[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (afterQuote) {
      if (character === ",") {
        record.push(field);
        field = "";
        afterQuote = false;
      } else if (character === "\n") {
        record.push(field);
        records.push(record);
        record = [];
        field = "";
        afterQuote = false;
      } else {
        throw new Error("A quoted value has unexpected characters after its closing quote.");
      }
      continue;
    }

    if (character === '"') {
      if (field.length > 0) {
        throw new Error("A quote appears inside an unquoted value.");
      }
      inQuotes = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (inQuotes) {
    throw new Error("A quoted value is missing its closing quote.");
  }

  record.push(field);
  records.push(record);
  return records.filter((candidate) => candidate.some((value) => value.trim()));
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (value.startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  const today = new Date().toISOString().slice(0, 10);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value >= "1900-01-01" && value <= today;
}

function validateRows(input: unknown): { rows: ImportMemberRow[]; error?: string } {
  if (!Array.isArray(input) || input.length < 1 || input.length > maximumRows) {
    return { rows: [], error: `The file must contain between 1 and ${maximumRows} members.` };
  }

  const rows: ImportMemberRow[] = [];
  const phones = new Set<string>();
  const emails = new Set<string>();

  for (let index = 0; index < input.length; index += 1) {
    const source = input[index];
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      return { rows: [], error: `Row ${index + 2} is not a valid member record.` };
    }

    const raw = source as Record<string, unknown>;
    const fullName = cell(raw.full_name);
    const preferredName = cell(raw.preferred_name);
    const email = cell(raw.email).toLowerCase();
    const rawPhone = cell(raw.phone);
    const dateOfBirth = cell(raw.date_of_birth);
    const gender = cell(raw.gender);
    const notes = typeof raw.notes === "string" ? raw.notes.trim() : "";
    const phone = normalizePhone(rawPhone);

    if (fullName.length < 2 || fullName.length > 120) {
      return { rows: [], error: `Row ${index + 2}: full_name must contain 2 to 120 characters.` };
    }
    if (preferredName.length > 80) {
      return { rows: [], error: `Row ${index + 2}: preferred_name is longer than 80 characters.` };
    }
    if (!phone) {
      return { rows: [], error: `Row ${index + 2}: phone is not a valid Indian or E.164 number.` };
    }
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      return { rows: [], error: `Row ${index + 2}: email is invalid.` };
    }
    if (dateOfBirth && !validDate(dateOfBirth)) {
      return { rows: [], error: `Row ${index + 2}: date_of_birth must be a real YYYY-MM-DD date.` };
    }
    if (gender && !genderValues.includes(gender as (typeof genderValues)[number])) {
      return { rows: [], error: `Row ${index + 2}: gender is not one of the template values.` };
    }
    if (notes.length > 2000) {
      return { rows: [], error: `Row ${index + 2}: notes is longer than 2,000 characters.` };
    }
    if (phones.has(phone)) {
      return { rows: [], error: `Row ${index + 2}: phone duplicates another row in this file.` };
    }
    if (email && emails.has(email)) {
      return { rows: [], error: `Row ${index + 2}: email duplicates another row in this file.` };
    }

    phones.add(phone);
    if (email) emails.add(email);
    rows.push({
      full_name: fullName,
      preferred_name: preferredName || null,
      email: email || null,
      phone,
      date_of_birth: dateOfBirth || null,
      gender: (gender || null) as ImportMemberRow["gender"],
      notes: notes || null,
    });
  }

  return { rows };
}

export async function processMemberImport(
  organizationSlug: string,
  previousState: MemberImportState,
  formData: FormData,
): Promise<MemberImportState> {
  const { membership, supabase } = await requireTenantMembership(organizationSlug);
  if (!membership.canManageMembers) {
    return uploadError("Your role does not permit member imports.");
  }

  const mode = cell(formData.get("mode"));
  const branchId = mode === "confirm" ? cell(previousState.branchId) : cell(formData.get("branchId"));
  const branch = membership.branches.find(
    (candidate) => candidate.id === branchId && candidate.status === "active",
  );
  if (!branch) {
    return uploadError("Select an active branch available to your role.");
  }

  if (mode === "confirm") {
    const fileName = cell(previousState.fileName);
    const validated = validateRows(previousState.rows);
    if (previousState.stage !== "preview" || !fileName || fileName.length > 180 || validated.error) {
      return uploadError("The preview expired or was changed. Upload the CSV again.");
    }

    const { error } = await supabase.rpc("import_members", {
      p_organization_id: membership.organization.id,
      p_branch_id: branch.id,
      p_source_file_name: fileName,
      p_rows: validated.rows,
    });
    if (error) {
      console.error("Member import failed", { code: error.code });
      if (error.code === "23505") {
        return { ...previousState, message: "A phone or email already belongs to a member in this gym. Update the CSV and preview it again." };
      }
      if (error.code === "42501") {
        return uploadError("Your role no longer permits imports for this branch.");
      }
      if (["22023", "23502", "23514"].includes(error.code)) {
        return { ...previousState, message: "One or more rows failed the final database validation. Update the CSV and preview it again." };
      }
      return { ...previousState, message: "The import could not be completed. No members were saved; please try again." };
    }

    const membersPath = `/gym/${organizationSlug}/members`;
    revalidatePath(membersPath);
    revalidatePath(`/gym/${organizationSlug}`);
    redirect(`${membersPath}?imported=${validated.rows.length}`);
  }

  const uploaded = formData.get("file");
  if (!(uploaded instanceof File) || uploaded.size === 0) {
    return uploadError("Choose a CSV file to preview.");
  }
  const fileName = uploaded.name.split(/[\\/]/).pop()?.trim() ?? "";
  if (!/\.csv$/i.test(fileName) || fileName.length > 180) {
    return uploadError("Use a .csv file with a name shorter than 181 characters.");
  }
  if (uploaded.size > maximumFileSize) {
    return uploadError("The CSV is larger than 512 KB. Split it into smaller batches.");
  }

  let records: string[][];
  try {
    records = parseCsv(await uploaded.text());
  } catch (error) {
    return uploadError(error instanceof Error ? error.message : "The CSV could not be read.");
  }
  if (records.length < 2) {
    return uploadError("The CSV needs the template header and at least one member row.");
  }
  const suppliedHeaders = records[0].map((value) => value.trim().toLowerCase());
  if (suppliedHeaders.length !== headers.length || suppliedHeaders.some((value, index) => value !== headers[index])) {
    return uploadError(`Use the exact template columns in this order: ${headers.join(", ")}.`);
  }
  const dataRows = records.slice(1);
  if (dataRows.some((row) => row.length !== headers.length)) {
    return uploadError("Every member row must contain all seven columns. Optional cells can be left blank.");
  }

  const prepared = dataRows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
  const validated = validateRows(prepared);
  if (validated.error) return uploadError(validated.error);

  return {
    stage: "preview",
    message: "",
    branchId: branch.id,
    fileName,
    rows: validated.rows,
  };
}
