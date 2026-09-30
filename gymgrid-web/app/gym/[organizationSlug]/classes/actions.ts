"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";

export interface ClassActionState {
  status: "idle" | "error";
  message: string;
}

function textField(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

export async function saveClassProgram(
  organizationSlug: string,
  _previousState: ClassActionState,
  formData: FormData,
): Promise<ClassActionState> {
  const branchId = textField(formData, "branchId");
  const code = textField(formData, "code").toUpperCase();
  const name = textField(formData, "name");
  const description = textField(formData, "description");
  const durationMinutes = Number(textField(formData, "durationMinutes"));
  const capacity = Number(textField(formData, "capacity"));
  if (
    !/^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(code) ||
    name.length < 2 ||
    name.length > 120 ||
    description.length > 1000 ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 15 ||
    durationMinutes > 240 ||
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    capacity > 500
  ) {
    return { status: "error", message: "Review the class code, name, duration, capacity, and description." };
  }

  const { membership, supabase } = await requireTenantMembership(organizationSlug);
  const branch = membership.branches.find((candidate) => candidate.id === branchId && candidate.status === "active");
  if (!membership.canManageClassPrograms || !branch) {
    return { status: "error", message: "Your role cannot create a class type for that branch." };
  }

  const { error } = await supabase.rpc("save_class_program", {
    p_organization_id: membership.organization.id,
    p_class_program_id: null,
    p_branch_id: branch.id,
    p_code: code,
    p_name: name,
    p_description: description || null,
    p_default_duration_minutes: durationMinutes,
    p_default_capacity: capacity,
    p_active: true,
  });
  if (error) {
    console.error("Class program save failed", { code: error.code });
    if (error.code === "23505") return { status: "error", message: "That class code is already used by this gym." };
    if (error.code === "42501") return { status: "error", message: "Your role cannot manage class types for this branch." };
    return { status: "error", message: "The class type could not be saved. Please review the values and try again." };
  }

  const classesPath = `/gym/${organizationSlug}/classes`;
  revalidatePath(classesPath);
  redirect(`${classesPath}?saved=program`);
}

export async function scheduleClassSession(
  organizationSlug: string,
  _previousState: ClassActionState,
  formData: FormData,
): Promise<ClassActionState> {
  const programId = textField(formData, "programId");
  const trainerId = textField(formData, "trainerId") || null;
  const startLocal = textField(formData, "startLocal");
  const capacityValue = textField(formData, "capacity");
  const capacity = capacityValue ? Number(capacityValue) : null;
  if (
    !/^[0-9a-f-]{36}$/i.test(programId) ||
    (trainerId && !/^[0-9a-f-]{36}$/i.test(trainerId)) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startLocal) ||
    (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 500))
  ) {
    return { status: "error", message: "Select a class type, valid local start time, trainer, and capacity." };
  }

  const { membership, supabase } = await requireTenantMembership(organizationSlug);
  if (!membership.canManageClassSessions) {
    return { status: "error", message: "Your role cannot schedule classes." };
  }
  const programResult = await supabase
    .from("class_programs")
    .select("id, branch_id")
    .eq("organization_id", membership.organization.id)
    .eq("id", programId)
    .eq("active", true)
    .maybeSingle();
  const allowedBranch = membership.branches.some(
    (branch) => branch.id === programResult.data?.branch_id && branch.status === "active",
  );
  if (programResult.error || !programResult.data || !allowedBranch) {
    return { status: "error", message: "The selected class type is not available in your branch scope." };
  }

  const { error } = await supabase.rpc("schedule_class_session", {
    p_organization_id: membership.organization.id,
    p_class_program_id: programId,
    p_trainer_organization_user_id: trainerId,
    p_start_local: startLocal.replace("T", " "),
    p_capacity: capacity,
  });
  if (error) {
    console.error("Class session scheduling failed", { code: error.code });
    if (error.code === "23P01") return { status: "error", message: "That trainer already has an overlapping class." };
    if (error.code === "42501") return { status: "error", message: "Your role cannot schedule this class." };
    return { status: "error", message: "The class could not be scheduled. Check the time, trainer, and capacity." };
  }

  const classesPath = `/gym/${organizationSlug}/classes`;
  revalidatePath(classesPath);
  redirect(`${classesPath}?scheduled=1`);
}

export async function cancelClassSession(
  organizationSlug: string,
  classSessionId: string,
  _previousState: ClassActionState,
  formData: FormData,
): Promise<ClassActionState> {
  const reason = textField(formData, "reason");
  if (!/^[0-9a-f-]{36}$/i.test(classSessionId) || reason.length < 2 || reason.length > 500) {
    return { status: "error", message: "Enter a cancellation reason between 2 and 500 characters." };
  }
  const { membership, supabase } = await requireTenantMembership(organizationSlug);
  if (!membership.canManageClassSessions) {
    return { status: "error", message: "Your role cannot cancel classes." };
  }
  const { error } = await supabase.rpc("cancel_class_session", {
    p_organization_id: membership.organization.id,
    p_class_session_id: classSessionId,
    p_reason: reason,
  });
  if (error) {
    console.error("Class session cancellation failed", { code: error.code });
    return { status: "error", message: "The class could not be cancelled. It may already be cancelled or outside your scope." };
  }
  revalidatePath(`/gym/${organizationSlug}/classes`);
  redirect(`/gym/${organizationSlug}/classes?cancelled=1`);
}

export async function bookClassMember(
  organizationSlug: string,
  classSessionId: string,
  _previousState: ClassActionState,
  formData: FormData,
): Promise<ClassActionState> {
  const memberId = textField(formData, "memberId");
  if (!/^[0-9a-f-]{36}$/i.test(classSessionId) || !/^[0-9a-f-]{36}$/i.test(memberId)) {
    return { status: "error", message: "Select a valid member for this class." };
  }
  const { membership, supabase } = await requireTenantMembership(organizationSlug);
  if (!membership.canManageClassBookings) {
    return { status: "error", message: "Your role cannot manage class bookings." };
  }
  const { data, error } = await supabase.rpc("book_class_session", {
    p_organization_id: membership.organization.id,
    p_class_session_id: classSessionId,
    p_member_id: memberId,
  });
  if (error) {
    console.error("Class booking failed", { code: error.code });
    if (error.code === "23505") return { status: "error", message: "That member is already booked or waitlisted." };
    if (error.code === "42501") return { status: "error", message: "Your role cannot book this member into the class." };
    if (error.code === "22023") return { status: "error", message: "The member needs an active membership for this branch." };
    return { status: "error", message: "The booking could not be completed. The class may have started or been cancelled." };
  }

  const booking = Array.isArray(data) ? data[0] : null;
  const result = booking?.booking_status === "waitlisted" ? "waitlisted" : "booked";
  const detailPath = `/gym/${organizationSlug}/classes/sessions/${classSessionId}`;
  revalidatePath(`/gym/${organizationSlug}/classes`);
  revalidatePath(detailPath);
  redirect(`${detailPath}?${result}=1`);
}

export async function cancelMemberClassBooking(
  organizationSlug: string,
  classSessionId: string,
  classBookingId: string,
  _previousState: ClassActionState,
  formData: FormData,
): Promise<ClassActionState> {
  const reason = textField(formData, "reason");
  if (
    !/^[0-9a-f-]{36}$/i.test(classSessionId) ||
    !/^[0-9a-f-]{36}$/i.test(classBookingId) ||
    reason.length < 2 ||
    reason.length > 500
  ) {
    return { status: "error", message: "Enter a cancellation reason between 2 and 500 characters." };
  }
  const { membership, supabase } = await requireTenantMembership(organizationSlug);
  if (!membership.canManageClassBookings) {
    return { status: "error", message: "Your role cannot cancel class bookings." };
  }
  const { error } = await supabase.rpc("cancel_class_booking", {
    p_organization_id: membership.organization.id,
    p_class_booking_id: classBookingId,
    p_reason: reason,
  });
  if (error) {
    console.error("Class booking cancellation failed", { code: error.code });
    return { status: "error", message: "The booking could not be cancelled. The class may have started or changed." };
  }
  const detailPath = `/gym/${organizationSlug}/classes/sessions/${classSessionId}`;
  revalidatePath(`/gym/${organizationSlug}/classes`);
  revalidatePath(detailPath);
  redirect(`${detailPath}?bookingCancelled=1`);
}
