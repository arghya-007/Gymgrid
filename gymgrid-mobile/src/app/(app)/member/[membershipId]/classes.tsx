import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Brand } from "@/components/brand";
import { PrimaryButton } from "@/components/primary-button";
import { colors } from "@/constants/colors";
import {
  formatGymDateTime,
  loadMyMemberProfile,
  type MemberProfile,
} from "@/lib/member-data";
import { supabase } from "@/lib/supabase";
import { useWorkspaces } from "@/providers/workspace-provider";

interface ClassSessionRow {
  id: string;
  branch_id: string;
  class_program_id: string;
  start_at: string;
  end_at: string;
  capacity: number;
}

interface ClassProgramRow {
  id: string;
  name: string;
  description: string | null;
}

interface ClassBookingRow {
  id: string;
  class_session_id: string;
  status: "booked" | "waitlisted" | "cancelled";
}

export default function MemberClassesScreen() {
  const { membershipId } = useLocalSearchParams<{ membershipId: string }>();
  const { workspaces } = useWorkspaces();
  const workspace = workspaces.find(
    (candidate) => candidate.membershipId === membershipId,
  );
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [sessions, setSessions] = useState<ClassSessionRow[]>([]);
  const [programs, setPrograms] = useState<ClassProgramRow[]>([]);
  const [bookings, setBookings] = useState<ClassBookingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!workspace?.hasMemberMode) {
      setError("This member workspace is no longer available.");
      setIsLoading(false);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const memberProfile = await loadMyMemberProfile(workspace.organization.id);
      if (!memberProfile) {
        throw new Error("Your account is not linked to a member record yet.");
      }

      const horizon = new Date();
      horizon.setDate(horizon.getDate() + 30);
      const sessionsResult = await supabase
        .from("class_sessions")
        .select("id, branch_id, class_program_id, start_at, end_at, capacity")
        .eq("organization_id", workspace.organization.id)
        .eq("status", "scheduled")
        .gte("start_at", new Date().toISOString())
        .lte("start_at", horizon.toISOString())
        .order("start_at")
        .limit(60);

      if (sessionsResult.error) throw sessionsResult.error;

      const sessionRows = (sessionsResult.data ?? []) as ClassSessionRow[];
      const sessionIds = sessionRows.map((session) => session.id);
      const programIds = sessionRows.map((session) => session.class_program_id);

      const [programsResult, bookingsResult] = await Promise.all([
        programIds.length
          ? supabase
              .from("class_programs")
              .select("id, name, description")
              .in("id", programIds)
          : Promise.resolve({ data: [], error: null }),
        sessionIds.length
          ? supabase
              .from("class_bookings")
              .select("id, class_session_id, status")
              .eq("organization_id", workspace.organization.id)
              .eq("member_id", memberProfile.id)
              .in("class_session_id", sessionIds)
              .in("status", ["booked", "waitlisted"])
          : Promise.resolve({ data: [], error: null }),
      ]);

      const firstError = programsResult.error ?? bookingsResult.error;
      if (firstError) throw firstError;

      setMember(memberProfile);
      setSessions(sessionRows);
      setPrograms((programsResult.data ?? []) as ClassProgramRow[]);
      setBookings((bookingsResult.data ?? []) as ClassBookingRow[]);
    } catch (cause) {
      console.error("Member classes could not be loaded", cause);
      setError(
        cause instanceof Error
          ? cause.message
          : "Upcoming classes could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [workspace]);

  useEffect(() => {
    const timeoutId = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timeoutId);
  }, [refresh]);

  const bookingBySession = useMemo(
    () => new Map(bookings.map((booking) => [booking.class_session_id, booking])),
    [bookings],
  );

  const bookSession = async (sessionId: string) => {
    if (!workspace || !member) return;

    setPendingId(sessionId);
    setMessage(null);

    try {
      const { data, error: bookingError } = await supabase.rpc(
        "book_class_session",
        {
          p_organization_id: workspace.organization.id,
          p_class_session_id: sessionId,
          p_member_id: member.id,
        },
      );

      if (bookingError) throw bookingError;

      const result = (data as { booking_status: string }[] | null)?.[0];
      setMessage(
        result?.booking_status === "waitlisted"
          ? "The class is full, so you joined the waitlist."
          : "Your class is booked.",
      );
      await refresh();
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "This class could not be booked.",
      );
    } finally {
      setPendingId(null);
    }
  };

  const cancelBooking = async (booking: ClassBookingRow) => {
    if (!workspace) return;

    setPendingId(booking.class_session_id);
    setMessage(null);

    try {
      const { error: cancellationError } = await supabase.rpc(
        "cancel_class_booking",
        {
          p_organization_id: workspace.organization.id,
          p_class_booking_id: booking.id,
          p_reason: "Cancelled in the GymGrid app",
        },
      );

      if (cancellationError) throw cancellationError;

      setMessage(
        booking.status === "waitlisted"
          ? "You left the waitlist."
          : "Your booking was cancelled.",
      );
      await refresh();
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "This booking could not be cancelled.",
      );
    } finally {
      setPendingId(null);
    }
  };

  if (!workspace) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>Workspace unavailable</Text>
          <PrimaryButton label="Back" onPress={() => router.replace("/")} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[colors.accent]}
            onRefresh={() => void refresh()}
            refreshing={isLoading}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.topBar}>
          <Brand compact />
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </View>

        <View style={styles.heading}>
          <Text style={styles.eyebrow}>MEMBER · CLASSES</Text>
          <Text style={styles.title}>Book your next session</Text>
          <Text style={styles.subtitle}>
            Upcoming classes at {workspace.organization.name} for the next 30 days.
          </Text>
        </View>

        {message && (
          <View style={styles.messageCard}>
            <Text style={styles.messageText}>{message}</Text>
          </View>
        )}

        {isLoading && sessions.length === 0 ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.stateText}>Loading class schedule…</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <Text style={styles.errorTitle}>Schedule unavailable</Text>
            <Text style={styles.stateText}>{error}</Text>
            <PrimaryButton label="Try again" onPress={() => void refresh()} />
          </View>
        ) : sessions.length === 0 ? (
          <View style={styles.centerState}>
            <Text style={styles.stateTitle}>No classes scheduled yet</Text>
            <Text style={styles.stateText}>
              Pull down later to check for newly published sessions.
            </Text>
          </View>
        ) : (
          <View style={styles.sessionList}>
            {sessions.map((session) => {
              const program = programs.find(
                (candidate) => candidate.id === session.class_program_id,
              );
              const branch = workspace.branches.find(
                (candidate) => candidate.id === session.branch_id,
              );
              const booking = bookingBySession.get(session.id);
              const pending = pendingId === session.id;

              return (
                <View key={session.id} style={styles.sessionCard}>
                  <View style={styles.sessionTopLine}>
                    <View style={styles.sessionCopy}>
                      <Text style={styles.sessionName}>
                        {program?.name ?? "Gym class"}
                      </Text>
                      <Text style={styles.sessionTime}>
                        {formatGymDateTime(
                          session.start_at,
                          workspace.organization.timezone,
                        )}
                      </Text>
                    </View>
                    {booking && (
                      <View
                        style={[
                          styles.bookingPill,
                          booking.status === "waitlisted" && styles.waitlistPill,
                        ]}
                      >
                        <Text
                          style={[
                            styles.bookingPillText,
                            booking.status === "waitlisted" &&
                              styles.waitlistPillText,
                          ]}
                        >
                          {booking.status}
                        </Text>
                      </View>
                    )}
                  </View>

                  <Text style={styles.sessionMeta}>
                    {branch?.name ?? "Assigned branch"} · Capacity {session.capacity}
                  </Text>
                  {program?.description && (
                    <Text style={styles.sessionDescription}>
                      {program.description}
                    </Text>
                  )}

                  {booking ? (
                    <PrimaryButton
                      label={
                        booking.status === "waitlisted"
                          ? "Leave waitlist"
                          : "Cancel booking"
                      }
                      loading={pending}
                      onPress={() => void cancelBooking(booking)}
                      tone="secondary"
                    />
                  ) : (
                    <PrimaryButton
                      label="Book class"
                      loading={pending}
                      onPress={() => void bookSession(session.id)}
                    />
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.canvas, flex: 1 },
  content: {
    alignSelf: "center",
    maxWidth: 760,
    padding: 22,
    width: "100%",
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  backText: { color: colors.accentDark, fontSize: 14, fontWeight: "800" },
  heading: { marginBottom: 24, marginTop: 40 },
  eyebrow: {
    color: colors.accentDark,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  title: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1,
    marginTop: 8,
  },
  subtitle: {
    color: colors.inkMuted,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
  },
  messageCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: 14,
    marginBottom: 16,
    padding: 14,
  },
  messageText: { color: colors.accentDeep, fontSize: 14, fontWeight: "700" },
  centerState: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    padding: 26,
  },
  stateTitle: { color: colors.ink, fontSize: 20, fontWeight: "900" },
  errorTitle: { color: colors.danger, fontSize: 20, fontWeight: "900" },
  stateText: {
    color: colors.inkMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  sessionList: { gap: 14 },
  sessionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    padding: 18,
  },
  sessionTopLine: { alignItems: "flex-start", flexDirection: "row" },
  sessionCopy: { flex: 1 },
  sessionName: { color: colors.ink, fontSize: 19, fontWeight: "900" },
  sessionTime: {
    color: colors.accentDeep,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 5,
  },
  bookingPill: {
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  bookingPillText: {
    color: colors.accentDeep,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  waitlistPill: { backgroundColor: colors.warningSoft },
  waitlistPillText: { color: colors.warning },
  sessionMeta: { color: colors.inkMuted, fontSize: 13 },
  sessionDescription: { color: colors.inkMuted, fontSize: 14, lineHeight: 20 },
});
