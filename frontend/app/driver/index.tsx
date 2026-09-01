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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import Button from "@/src/components/Button";
import Sheet from "@/src/components/Sheet";
import { colors, fonts, radius, spacing, statusColor, statusLabel } from "@/src/theme";

type Student = { id: string; name: string; class_grade: string; batch_id: string; absent_today: boolean };
type Batch = { id: string; name: string; school_name: string; pickup_time: string; students: Student[] };
type Trip = { id: string; batch_id: string; batch_name: string; status: string } | null;

// Base coordinate (used to simulate movement when device GPS is unavailable).
let simLat = 12.9716;
let simLng = 77.5946;

export default function DriverDashboard() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const toast = useToast();

  const [batches, setBatches] = useState<Batch[]>([]);
  const [trip, setTrip] = useState<Trip>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState(false);
  const [moveStudent, setMoveStudent] = useState<Student | null>(null);
  const intervalRef = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const [b, t] = await Promise.all([api.driverBatches(), api.driverActiveTrip()]);
      setBatches(b);
      setTrip(t);
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

  // Start / stop the 10s GPS ping loop based on active trip.
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

  const startTrip = async (batchId: string) => {
    setActing(true);
    await ensureLocationPermission();
    try {
      const t = await api.startTrip(batchId);
      setTrip(t);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show("Trip started — parents notified", "success");
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
      toast.show("Student moved — parent notified", "success");
      load();
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  };

  const activeBatch = trip ? batches.find((b) => b.id === trip.batch_id) : null;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hi}>Driver</Text>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.vehicle}>{user?.vehicle_number}</Text>
        </View>
        <Pressable testID="logout-button" onPress={logout} style={styles.iconBtn} hitSlop={10}>
          <Ionicons name="log-out-outline" size={22} color={colors.onSurfaceSecondary} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}
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
        {/* Active trip control */}
        {trip ? (
          <View style={styles.tripCard} testID="active-trip-card">
            <View style={styles.tripTop}>
              <View style={[styles.statusDot, { backgroundColor: statusColor(trip.status) }]} />
              <Text style={styles.tripStatus}>{statusLabel(trip.status)}</Text>
            </View>
            <Text style={styles.tripBatch}>{trip.batch_name}</Text>
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
            <View style={styles.liveBadge}>
              <View style={styles.pulse} />
              <Text style={styles.liveText}>Sharing GPS every 10s</Text>
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
          <View style={styles.idleCard} testID="idle-card">
            <Ionicons name="bus-outline" size={40} color={colors.brand} />
            <Text style={styles.idleTitle}>No active trip</Text>
            <Text style={styles.idleSub}>Start a batch below to begin live tracking</Text>
          </View>
        )}

        {/* Batches */}
        <Text style={styles.sectionTitle}>My Batches</Text>
        {batches.length === 0 && <Text style={styles.emptyText}>No batches assigned yet.</Text>}
        {batches.map((b) => {
          const isActive = trip?.batch_id === b.id;
          return (
            <View key={b.id} style={styles.batchCard} testID={`batch-${b.id}`}>
              <View style={styles.batchHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.batchName}>{b.name}</Text>
                  <Text style={styles.batchMeta}>
                    {b.school_name} · {b.pickup_time} · {b.students.length} students
                  </Text>
                </View>
                {!trip && (
                  <Button
                    testID={`start-trip-${b.id}`}
                    label="START"
                    onPress={() => startTrip(b.id)}
                    loading={acting}
                    haptic="heavy"
                    style={styles.startBtn}
                  />
                )}
                {isActive && (
                  <View style={styles.activeTag}>
                    <Text style={styles.activeTagText}>LIVE</Text>
                  </View>
                )}
              </View>

              {b.students.map((s) => (
                <View key={s.id} style={styles.studentRow} testID={`student-${s.id}`}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{s.name.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.studentName, s.absent_today && styles.absentName]}>{s.name}</Text>
                    <Text style={styles.studentClass}>{s.class_grade}</Text>
                  </View>
                  <Pressable
                    testID={`move-${s.id}`}
                    onPress={() => setMoveStudent(s)}
                    style={styles.moveBtn}
                    hitSlop={8}
                  >
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
          );
        })}
      </ScrollView>

      {/* Move student sheet */}
      <Sheet
        visible={!!moveStudent}
        onClose={() => setMoveStudent(null)}
        title={`Move ${moveStudent?.name || ""}`}
        testID="move-sheet"
      >
        <Text style={styles.sheetHint}>Select a batch to move this student to. The parent will be notified.</Text>
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

  tripCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  tripTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  tripStatus: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface, letterSpacing: 0.5 },
  tripBatch: { fontFamily: fonts.displayBold, fontSize: 26, color: colors.onSurface, marginTop: spacing.xs },
  statusRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  pill: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
  pillText: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurfaceSecondary },
  pillTextActive: { color: colors.brand },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg },
  pulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  liveText: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.onSurfaceSecondary },

  idleCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  idleTitle: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.onSurface },
  idleSub: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceSecondary, textAlign: "center" },

  sectionTitle: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.onSurface, marginTop: spacing.xl, marginBottom: spacing.md, letterSpacing: 0.5 },
  emptyText: { fontFamily: fonts.text, fontSize: 14, color: colors.onSurfaceSecondary },

  batchCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  batchHead: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm },
  batchName: { fontFamily: fonts.textBold, fontSize: 16, color: colors.onSurface },
  batchMeta: { fontFamily: fonts.text, fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  startBtn: { height: 44, paddingHorizontal: spacing.lg },
  activeTag: { backgroundColor: colors.success, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  activeTagText: { fontFamily: fonts.textBold, fontSize: 11, color: colors.onSuccess, letterSpacing: 1 },

  studentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.displayBold, fontSize: 16, color: colors.brand },
  studentName: { fontFamily: fonts.textMedium, fontSize: 15, color: colors.onSurface },
  absentName: { textDecorationLine: "line-through", color: colors.onSurfaceSecondary },
  studentClass: { fontFamily: fonts.text, fontSize: 12, color: colors.onSurfaceSecondary },
  moveBtn: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  absentBtn: {
    minWidth: 74,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  absentBtnActive: { backgroundColor: colors.error },
  absentBtnText: { fontFamily: fonts.textBold, fontSize: 13, color: colors.onSurface },

  sheetHint: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceSecondary, marginBottom: spacing.md },
  moveOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  moveOptionCurrent: { opacity: 0.55 },
  moveOptionName: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface },
  moveOptionMeta: { fontFamily: fonts.text, fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  currentTag: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.onSurfaceSecondary },
});
