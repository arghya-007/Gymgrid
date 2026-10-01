"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_DIMENSION = 512;

async function compressPhoto(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("Choose an image smaller than 12 MB.");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the image.");

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.78),
  );
  if (!blob) throw new Error("This browser could not compress the image.");
  if (blob.size > 1024 * 1024) {
    throw new Error("The prepared photo is still larger than 1 MB.");
  }
  return blob;
}

export function PhotoUploader({
  organizationId,
  memberId,
  currentPhotoPath,
  currentPhotoUrl,
  memberName,
}: {
  organizationId: string;
  memberId: string;
  currentPhotoPath: string | null;
  currentPhotoUrl: string | null;
  memberName: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(currentPhotoUrl);
  const [photoPath, setPhotoPath] = useState(currentPhotoPath);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function uploadPhoto(file: File) {
    if (!consentConfirmed) {
      setError("Confirm the member's photo consent before uploading.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setPending(true);
    setError(null);
    setMessage(null);

    try {
      const blob = await compressPhoto(file);
      const path = `${organizationId}/${memberId}/profile.webp`;
      const supabase = createClient();
      const uploadResult = await supabase.storage
        .from("member-photos")
        .upload(path, blob, {
          cacheControl: "3600",
          contentType: "image/webp",
          upsert: true,
        });

      if (uploadResult.error) throw uploadResult.error;

      const profileResult = await supabase.rpc("set_member_photo", {
        p_organization_id: organizationId,
        p_member_id: memberId,
        p_photo_path: path,
        p_consent_version: "2026-10-v1",
      });

      if (profileResult.error) {
        await supabase.storage.from("member-photos").remove([path]);
        throw profileResult.error;
      }

      const signedResult = await supabase.storage
        .from("member-photos")
        .createSignedUrl(path, 3600);
      if (signedResult.error) throw signedResult.error;

      setPhotoPath(path);
      setPhotoUrl(signedResult.data.signedUrl);
      setMessage("Member photo saved.");
      setConsentConfirmed(false);
      router.refresh();
    } catch (cause) {
      console.error("Member photo upload failed", cause);
      setError(
        cause instanceof Error
          ? cause.message
          : "The member photo could not be uploaded.",
      );
    } finally {
      if (inputRef.current) inputRef.current.value = "";
      setPending(false);
    }
  }

  async function removePhoto() {
    if (!photoPath) return;
    setPending(true);
    setError(null);
    setMessage(null);

    try {
      const supabase = createClient();
      const profileResult = await supabase.rpc("clear_member_photo", {
        p_organization_id: organizationId,
        p_member_id: memberId,
      });
      if (profileResult.error) throw profileResult.error;

      const removeResult = await supabase.storage
        .from("member-photos")
        .remove([photoPath]);
      if (removeResult.error) {
        console.error("Detached member photo object could not be removed", {
          message: removeResult.error.message,
        });
      }

      setPhotoPath(null);
      setPhotoUrl(null);
      setMessage("Member photo removed.");
      router.refresh();
    } catch (cause) {
      console.error("Member photo removal failed", cause);
      setError("The member photo could not be removed. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const initials = memberName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-xl font-semibold">Member photo</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Photos are compressed in the browser and stored in a private, access-controlled bucket.
      </p>
      <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center">
        {photoUrl ? (
          // Signed, short-lived tenant asset; a native img avoids coupling allowed hosts to one Supabase project.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={`${memberName} profile`}
            className="h-28 w-28 rounded-3xl border border-slate-200 object-cover"
            src={photoUrl}
          />
        ) : (
          <div className="flex h-28 w-28 items-center justify-center rounded-3xl bg-emerald-100 text-2xl font-bold text-emerald-800">
            {initials || "GG"}
          </div>
        )}
        <div className="flex-1 space-y-4">
          <label className="flex items-start gap-3 text-sm leading-6 text-slate-700">
            <input
              checked={consentConfirmed}
              className="mt-1 h-4 w-4 accent-emerald-700"
              onChange={(event) => setConsentConfirmed(event.target.checked)}
              type="checkbox"
            />
            <span>I confirm the member agreed to their photograph being stored for gym operations.</span>
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="inline-flex cursor-pointer rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 aria-disabled:cursor-not-allowed aria-disabled:opacity-60">
              {pending ? "Working…" : photoPath ? "Replace photo" : "Upload photo"}
              <input
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={pending}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadPhoto(file);
                }}
                ref={inputRef}
                type="file"
              />
            </label>
            {photoPath ? (
              <button
                className="rounded-xl border border-rose-200 px-5 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
                disabled={pending}
                onClick={() => void removePhoto()}
                type="button"
              >
                Remove photo
              </button>
            ) : null}
          </div>
          {message ? <p className="text-sm text-emerald-700" role="status">{message}</p> : null}
          {error ? <p className="text-sm text-rose-700" role="alert">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}
