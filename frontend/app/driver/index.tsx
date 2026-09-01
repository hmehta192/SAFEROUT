import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Linking,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import Button from "@/src/components/Button";
import Sheet from "@/src/components/Sheet";
import { colors, fonts, radius, spacing, statusColor, statusLabel } from "@/src/theme";

type Student = { id: string; name: string; class_grade: string; batch_id: string; absent_today: boolean };
type Batch = {
  id: string;
  name: string;
  school_name: string;
  pickup_time: string;
  unavailable?: boolean;
  unavailable_reason?: string;
  students: Student[];
};
type Trip = { id: string; batch_id: string; batch_name: string; status: string } | null;

const CARD_COLORS = ["#FFAB00", "#29B6F6", "#00E676", "#FF7043"];

let simLat = 12.9716;
let simLng = 77.5946;

export default function DriverDashboard() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const toast = useToast();
  const router = useRouter();

  const doLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const [batches, setBatches] = useState<Batch[]>([]);
  const [trip, setTrip] = useState<Trip>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [moveStudent, setMoveStudent] = useState<Student | null>(null);
  const [unavailFor, setUnavailFor] = useState<Batch | null>(null);
  const [reason, setReason] = useState("");
  const intervalRef = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const [b, t] = await Promise.all([api.driverBatches(), api.driverActiveTrip()]);
      setBatches(b);
      setTrip(t);
      setSelectedBatch((prev) => prev ?? b[0]?.id ?? null);
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!user) return;
    load();
  }, [load, user]);

  const pushLocation = useCallback(async () => {
    let lat = simLat;
    let lng = simLng;
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === "granted" && Platform.OS !== "web") {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } else {
        simLat += (Math.random() - 0.4) * 0.0009;
        simLng += (Math.random() - 0.4) * 0.0009;
        lat = simLat;
        lng = simLng;
      }
    } catch {
      simLat += (Math.random() - 0.4) * 0.0009;
      simLng += (Math.random() - 0.4) * 0.0009;
      lat = simLat;
      lng = simLng;
    }
    try {
      await api.updateLocation(lat, lng);
    } catch {}
  }, []);

  // Auto GPS: starts the moment a trip is active, stops when it ends. No extra button.
  useEffect(() => {
    if (trip && trip.status !== "ended") {
      pushLocation();
      intervalRef.current = setInterval(pushLocation, 10000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [trip?.id, trip?.status, pushLocation]);

  const ensureLocationPermission = async () => {
    try {
      const current = await Location.getForegroundPermissionsAsync();
      if (current.status === "granted") return true;
      if (current.canAskAgain) {
        const req = await Location.requestForegroundPermissionsAsync();
        if (req.status === "granted") return true;
        if (!req.canAskAgain) {
          toast.show("Enable location in Settings to share live GPS", "error");
          Linking.openSettings();
        }
        return false;
      }
      toast.show("Location blocked — using simulated position", "info");
      return false;
    } catch {
      return false;
    }
  };

  const startTrip = async () => {
    if (!selectedBatch) return toast.show("Tap a batch first", "info");
    setActing(true);
    await ensureLocationPermission();
    try {
      const t = await api.startTrip(selectedBatch);
      setTrip(t);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show("Trip started — GPS is live, parents notified", "success");
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setActing(false);
    }
  };

  const setStatus = async (status: string) => {
    setActing(true);
    try {
      const t = await api.updateTripStatus(status);
      setTrip(t);
      toast.show(`Status: ${statusLabel(status)}`, "success");
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setActing(false);
    }
  };

  const endTrip = async () => {
    setActing(true);
    try {
      await api.endTrip();
      setTrip(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      toast.show("Trip ended", "info");
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setActing(false);
    }
  };

  const submitUnavailable = async () => {
    if (!unavailFor) return;
    if (reason.trim().length < 3) return toast.show("Please type a short reason", "error");
    setActing(true);
    try {
      await api.driverUnavailable(unavailFor.id, reason.trim());
      toast.show("Sent — parents & admin notified", "success");
      setUnavailFor(null);
      setReason("");
      setTrip(null);
      load();
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setActing(false);
    }
  };

  const toggleAbsent = async (s: Student) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await api.markAbsent(s.id, !s.absent_today);
      setBatches((prev) =>
        prev.map((b) => ({
          ...b,
          students: b.students.map((st) => (st.id === s.id ? { ...st, absent_today: !st.absent_today } : st)),
        }))
      );
      toast.show(!s.absent_today ? `${s.name} marked absent` : `${s.name} marked present`, "info");
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  };

  const doMove = async (batchId: string) => {
    if (!moveStudent) return;
    try {
      await api.moveStudent(moveStudent.id, batchId);
      setMoveStudent(null);
      toast.show("Student moved — parent & admin notified", "success");
      load();
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  };

  const activeBatchId = trip ? trip.batch_id : selectedBatch;
  const shownBatch = batches.find((b) => b.id === activeBatchId) || null;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hi}>Driver</Text>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.vehicle}>{user?.vehicle_number}</Text>
        </View>
        <Pressable testID="logout-button" onPress={doLogout} style={styles.iconBtn} hitSlop={10}>
          <Ionicons name="log-out-outline" size={22} color={colors.onSurfaceSecondary} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxxl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.brand}
          />
        }
      >
        {trip ? (
          /* ---------- ACTIVE TRIP ---------- */
          <View style={styles.tripCard} testID="active-trip-card">
            <View style={styles.tripTop}>
              <View style={[styles.statusDot, { backgroundColor: statusColor(trip.status) }]} />
              <Text style={styles.tripStatus}>{statusLabel(trip.status)}</Text>
            </View>
            <Text style={styles.tripBatch}>{trip.batch_name}</Text>

            <View style={styles.liveBadge} testID="gps-live-badge">
              <View style={styles.pulse} />
              <Text style={styles.liveText}>Location is being shared automatically</Text>
            </View>

            <Text style={styles.helperLabel}>Update parents:</Text>
            <View style={styles.statusRow}>
              <StatusPill
                label="On the Way"
                active={trip.status === "on_the_way"}
                onPress={() => setStatus("on_the_way")}
                testID="status-on-the-way"
              />
              <StatusPill
                label="Reached"
                active={trip.status === "reached"}
                onPress={() => setStatus("reached")}
                testID="status-reached"
              />
            </View>

            <Button
              testID="end-trip-button"
              label="END TRIP"
              variant="danger"
              large
              haptic="heavy"
              loading={acting}
              onPress={endTrip}
              style={{ marginTop: spacing.md }}
            />
          </View>
        ) : (
          /* ---------- PICK A BATCH ---------- */
          <View>
            <Text style={styles.bigHeading}>Tap a batch to start</Text>
            <Text style={styles.subHeading}>Pick one, then press the big green button</Text>

            {batches.length === 0 && <Text style={styles.emptyText}>No batches assigned yet.</Text>}

            {batches.map((b, i) => {
              const selected = selectedBatch === b.id;
              const color = CARD_COLORS[i % CARD_COLORS.length];
              return (
                <Pressable
                  key={b.id}
                  testID={`batch-card-${b.id}`}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setSelectedBatch(b.id);
                  }}
                  style={[styles.bigCard, selected && { borderColor: color, borderWidth: 3 }]}
                >
                  <View style={[styles.cardStripe, { backgroundColor: color }]} />
                  <View style={[styles.cardIcon, { backgroundColor: color + "22" }]}>
                    <Ionicons name="bus" size={28} color={color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bigCardName}>{b.name}</Text>
                    <Text style={styles.bigCardMeta}>
                      {b.students.length} students · {b.pickup_time}
                    </Text>
                    {b.unavailable && (
                      <Text style={styles.unavailNote}>You marked this unavailable</Text>
                    )}
                  </View>
                  <View style={[styles.check, selected && { backgroundColor: color, borderColor: color }]}>
                    {selected && <Ionicons name="checkmark" size={20} color="#000" />}
                  </View>
                </Pressable>
              );
            })}

            {batches.length > 0 && (
              <>
                <Button
                  testID="start-trip-button"
                  label={selectedBatch ? "START TRIP" : "SELECT A BATCH"}
                  variant="success"
                  large
                  haptic="heavy"
                  disabled={!selectedBatch}
                  loading={acting}
                  onPress={startTrip}
                  style={{ marginTop: spacing.lg }}
                />
                <Pressable
                  testID="mark-unavailable-button"
                  disabled={!selectedBatch}
                  onPress={() => {
                    const b = batches.find((x) => x.id === selectedBatch) || null;
                    setReason("");
                    setUnavailFor(b);
                  }}
                  style={[styles.unavailBtn, !selectedBatch && { opacity: 0.4 }]}
                >
                  <Ionicons name="close-circle-outline" size={18} color={colors.error} />
                  <Text style={styles.unavailBtnText}>I can&apos;t drive this batch</Text>
                </Pressable>
              </>
            )}
          </View>
        )}

        {/* ---------- STUDENTS OF THE ACTIVE/SELECTED BATCH ---------- */}
        {shownBatch && (
          <View style={styles.studentsBlock}>
            <Text style={styles.sectionTitle}>Students · {shownBatch.name}</Text>
            {shownBatch.students.length === 0 && <Text style={styles.emptyText}>No students in this batch.</Text>}
            {shownBatch.students.map((s) => (
              <View key={s.id} style={styles.studentRow} testID={`student-${s.id}`}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{s.name.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.studentName, s.absent_today && styles.absentName]}>{s.name}</Text>
                  <Text style={styles.studentClass}>{s.class_grade}</Text>
                </View>
                <Pressable testID={`move-${s.id}`} onPress={() => setMoveStudent(s)} style={styles.moveBtn} hitSlop={8}>
                  <Ionicons name="swap-horizontal" size={18} color={colors.onSurfaceSecondary} />
                </Pressable>
                <Pressable
                  testID={`absent-${s.id}`}
                  onPress={() => toggleAbsent(s)}
                  style={[styles.absentBtn, s.absent_today && styles.absentBtnActive]}
                >
                  <Text style={[styles.absentBtnText, s.absent_today && { color: colors.onError }]}>
                    {s.absent_today ? "Absent" : "Present"}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Move student sheet */}
      <Sheet
        visible={!!moveStudent}
        onClose={() => setMoveStudent(null)}
        title={`Move ${moveStudent?.name || ""}`}
        testID="move-sheet"
      >
        <Text style={styles.sheetHint}>Pick the batch to move this student to. The parent and admin are notified.</Text>
        {batches.map((b) => {
          const current = moveStudent?.batch_id === b.id;
          return (
            <Pressable
              key={b.id}
              testID={`move-to-${b.id}`}
              disabled={current}
              onPress={() => doMove(b.id)}
              style={[styles.moveOption, current && styles.moveOptionCurrent]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.moveOptionName}>{b.name}</Text>
                <Text style={styles.moveOptionMeta}>{b.pickup_time}</Text>
              </View>
              {current ? (
                <Text style={styles.currentTag}>Current</Text>
              ) : (
                <Ionicons name="chevron-forward" size={18} color={colors.brand} />
              )}
            </Pressable>
          );
        })}
      </Sheet>

      {/* Unavailable reason sheet */}
      <Sheet
        visible={!!unavailFor}
        onClose={() => setUnavailFor(null)}
        title="Can't drive this batch?"
        testID="unavailable-sheet"
        footer={
          <Button
            label="SEND TO PARENTS & ADMIN"
            variant="danger"
            loading={acting}
            onPress={submitUnavailable}
            testID="submit-unavailable-button"
          />
        }
      >
        <Text style={styles.sheetHint}>
          Tell us why. Everyone in <Text style={{ color: colors.onSurface }}>{unavailFor?.name}</Text> and the school admin
          will get an instant alert.
        </Text>
        <TextInput
          testID="unavailable-reason-input"
          style={styles.reasonInput}
          placeholder="e.g. Bus breakdown near market road"
          placeholderTextColor={colors.onSurfaceSecondary}
          value={reason}
          onChangeText={setReason}
          multiline
        />
        <View style={styles.quickReasons}>
          {["Vehicle breakdown", "I am sick", "Traffic / road blocked", "Personal emergency"].map((r) => (
            <Pressable key={r} testID={`quick-reason-${r}`} onPress={() => setReason(r)} style={styles.quickChip}>
              <Text style={styles.quickChipText}>{r}</Text>
            </Pressable>
          ))}
        </View>
      </Sheet>
    </View>
  );
}

function StatusPill({ label, active, onPress, testID }: any) {
  return (
    <Pressable testID={testID} onPress={onPress} style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  hi: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.onSurfaceSecondary, letterSpacing: 1, textTransform: "uppercase" },
  name: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.onSurface },
  vehicle: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.brand },
  iconBtn: { padding: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md },

  bigHeading: { fontFamily: fonts.displayBold, fontSize: 28, color: colors.onSurface, letterSpacing: 0.5 },
  subHeading: { fontFamily: fonts.text, fontSize: 15, color: colors.onSurfaceSecondary, marginTop: spacing.xs, marginBottom: spacing.lg },

  bigCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  cardStripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 6 },
  cardIcon: { width: 56, height: 56, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginLeft: spacing.xs },
  bigCardName: { fontFamily: fonts.displayBold, fontSize: 21, color: colors.onSurface },
  bigCardMeta: { fontFamily: fonts.textMedium, fontSize: 14, color: colors.onSurfaceSecondary, marginTop: 2 },
  unavailNote: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.error, marginTop: 4 },
  check: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },

  unavailBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  unavailBtnText: { fontFamily: fonts.textBold, fontSize: 15, color: colors.error },

  tripCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  tripTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  tripStatus: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface, letterSpacing: 0.5 },
  tripBatch: { fontFamily: fonts.displayBold, fontSize: 28, color: colors.onSurface, marginTop: spacing.xs },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md, backgroundColor: "rgba(0,230,118,0.12)", borderRadius: radius.md, padding: spacing.md },
  pulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  liveText: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.success },
  helperLabel: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurfaceSecondary, marginTop: spacing.lg, marginBottom: spacing.sm },
  statusRow: { flexDirection: "row", gap: spacing.md },
  pill: {
    flex: 1,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
  pillText: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurfaceSecondary },
  pillTextActive: { color: colors.brand },

  studentsBlock: { marginTop: spacing.xl },
  sectionTitle: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.onSurface, marginBottom: spacing.md, letterSpacing: 0.5 },
  emptyText: { fontFamily: fonts.text, fontSize: 14, color: colors.onSurfaceSecondary },

  studentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.displayBold, fontSize: 17, color: colors.brand },
  studentName: { fontFamily: fonts.textBold, fontSize: 16, color: colors.onSurface },
  absentName: { textDecorationLine: "line-through", color: colors.onSurfaceSecondary },
  studentClass: { fontFamily: fonts.text, fontSize: 12, color: colors.onSurfaceSecondary },
  moveBtn: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  absentBtn: {
    minWidth: 84,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  absentBtnActive: { backgroundColor: colors.error },
  absentBtnText: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },

  sheetHint: { fontFamily: fonts.text, fontSize: 14, color: colors.onSurfaceSecondary, marginBottom: spacing.md, lineHeight: 20 },
  moveOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  moveOptionCurrent: { opacity: 0.55 },
  moveOptionName: { fontFamily: fonts.textBold, fontSize: 16, color: colors.onSurface },
  moveOptionMeta: { fontFamily: fonts.text, fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  currentTag: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.onSurfaceSecondary },

  reasonInput: {
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    minHeight: 90,
    padding: spacing.lg,
    fontFamily: fonts.textMedium,
    fontSize: 16,
    color: colors.onSurface,
    borderWidth: 1,
    borderColor: colors.border,
    textAlignVertical: "top",
  },
  quickReasons: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  quickChip: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border },
  quickChipText: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurface },
});
