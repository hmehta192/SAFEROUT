import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import Sheet from "@/src/components/Sheet";
import LiveMap from "@/src/components/LiveMap";
import { colors, fonts, radius, spacing, statusColor, statusLabel } from "@/src/theme";

type Trip = {
  id: string;
  status: string;
  current_lat: number | null;
  current_lng: number | null;
  updated_at: string;
} | null;

type TripInfo = {
  student_id: string;
  student_name: string;
  absent_today: boolean;
  batch_name: string;
  driver_name: string;
  vehicle_number: string;
  trip: Trip;
};

type Alert = { id: string; type: string; title: string; message: string; created_at: string; read: boolean };

const STEPS = [
  { key: "started", label: "Trip Started", icon: "flag" },
  { key: "on_the_way", label: "On the Way", icon: "navigate" },
  { key: "reached", label: "Reached", icon: "checkmark-done" },
];
const ORDER: Record<string, number> = { started: 0, on_the_way: 1, reached: 2 };

export default function ParentTracking() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const toast = useToast();

  const [trips, setTrips] = useState<TripInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAlerts, setShowAlerts] = useState(false);
  const pollRef = useRef<any>(null);

  const loadTrips = useCallback(async () => {
    try {
      const t = await api.parentTrips();
      setTrips(t);
      setSelected((prev) => prev || (t[0]?.student_id ?? null));
    } catch (e: any) {
      // silent during polling
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    try {
      const a = await api.parentAlerts();
      setAlerts(a);
    } catch {}
  }, []);

  useEffect(() => {
    if (!user) return;
    loadTrips();
    loadAlerts();
    pollRef.current = setInterval(() => {
      loadTrips();
      loadAlerts();
    }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadTrips, loadAlerts, user]);

  const current = trips.find((t) => t.student_id === selected) || trips[0];
  const trip = current?.trip;
  const unread = alerts.filter((a) => !a.read).length;

  const openAlerts = async () => {
    setShowAlerts(true);
    await api.readAllAlerts();
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
  };

  const hasLoc = trip?.current_lat != null && trip?.current_lng != null;
  const region = {
    latitude: hasLoc ? (trip!.current_lat as number) : 12.9716,
    longitude: hasLoc ? (trip!.current_lng as number) : 77.5946,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  };
  const markers = hasLoc
    ? [{ lat: trip!.current_lat as number, lng: trip!.current_lng as number, title: current?.vehicle_number }]
    : [];

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Map region (top 60%) */}
      <View style={styles.mapWrap}>
        <LiveMap region={region} markers={markers} />

        {/* Floating header */}
        <View style={[styles.floatHeader, { top: insets.top + spacing.sm }]}>
          <View style={styles.brandPill}>
            <Ionicons name="location" size={16} color={colors.brand} />
            <Text style={styles.brandPillText}>SafeRoute</Text>
          </View>
          <View style={styles.floatRight}>
            <Pressable testID="alerts-button" style={styles.iconBtn} onPress={openAlerts}>
              <Ionicons name="notifications" size={20} color={colors.onSurface} />
              {unread > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unread}</Text>
                </View>
              )}
            </Pressable>
            <Pressable testID="logout-button" style={styles.iconBtn} onPress={logout}>
              <Ionicons name="log-out-outline" size={20} color={colors.onSurface} />
            </Pressable>
          </View>
        </View>

        {/* Child selector chips */}
        {trips.length > 1 && (
          <View style={[styles.chipsWrap, { top: insets.top + spacing.xxxl + spacing.md }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              {trips.map((t) => {
                const active = t.student_id === (current?.student_id);
                return (
                  <Pressable
                    key={t.student_id}
                    testID={`child-chip-${t.student_id}`}
                    onPress={() => setSelected(t.student_id)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.student_name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Persistent bottom panel (40%) */}
      <View style={[styles.panel, { paddingBottom: insets.bottom + spacing.md }]} testID="parent-panel">
        <View style={styles.panelHandle} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.md }}>
          <View style={styles.panelHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.childName}>{current?.student_name}</Text>
              <Text style={styles.childMeta}>
                {current?.driver_name} · {current?.vehicle_number}
              </Text>
            </View>
            <View style={[styles.statusChip, { backgroundColor: statusColor(trip?.status) + "22" }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor(trip?.status) }]} />
              <Text style={[styles.statusChipText, { color: statusColor(trip?.status) }]}>
                {statusLabel(trip?.status)}
              </Text>
            </View>
          </View>

          {current?.absent_today && (
            <View style={styles.absentBanner} testID="absent-banner">
              <Ionicons name="alert-circle" size={18} color={colors.warning} />
              <Text style={styles.absentBannerText}>Marked absent today</Text>
            </View>
          )}

          {trip ? (
            <View style={styles.timeline} testID="trip-timeline">
              {STEPS.map((step, i) => {
                const reachedStep = ORDER[trip.status] >= i;
                const isCurrent = ORDER[trip.status] === i;
                return (
                  <View key={step.key} style={styles.step}>
                    <View style={styles.stepIndicator}>
                      <View style={[styles.stepCircle, reachedStep && styles.stepCircleActive, isCurrent && styles.stepCircleCurrent]}>
                        <Ionicons
                          name={step.icon as any}
                          size={16}
                          color={reachedStep ? colors.onBrand : colors.onSurfaceSecondary}
                        />
                      </View>
                      {i < STEPS.length - 1 && <View style={[styles.stepLine, reachedStep && styles.stepLineActive]} />}
                    </View>
                    <View style={styles.stepBody}>
                      <Text style={[styles.stepLabel, reachedStep && styles.stepLabelActive]}>{step.label}</Text>
                      {isCurrent && <Text style={styles.stepNow}>Now</Text>}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.noTrip} testID="no-trip">
              <Ionicons name="time-outline" size={32} color={colors.onSurfaceSecondary} />
              <Text style={styles.noTripTitle}>Bus hasn&apos;t started yet</Text>
              <Text style={styles.noTripSub}>You&apos;ll see live location once {current?.driver_name} starts the trip.</Text>
            </View>
          )}
        </ScrollView>
      </View>

      {/* Alerts sheet */}
      <Sheet visible={showAlerts} onClose={() => setShowAlerts(false)} title="Notifications" testID="alerts-sheet">
        {alerts.length === 0 && <Text style={styles.emptyAlerts}>No notifications yet.</Text>}
        {alerts.map((a) => (
          <View key={a.id} style={styles.alertRow} testID={`alert-${a.id}`}>
            <View style={[styles.alertIcon, { backgroundColor: alertColor(a.type) + "22" }]}>
              <Ionicons name={alertIcon(a.type) as any} size={18} color={alertColor(a.type)} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>{a.title}</Text>
              <Text style={styles.alertMsg}>{a.message}</Text>
              <Text style={styles.alertTime}>{new Date(a.created_at).toLocaleString()}</Text>
            </View>
          </View>
        ))}
      </Sheet>
    </View>
  );
}

const alertColor = (t: string) =>
  t === "absent" ? colors.error : t === "batch_change" ? colors.warning : colors.info;
const alertIcon = (t: string) =>
  t === "absent" ? "person-remove" : t === "batch_change" ? "swap-horizontal" : "bus";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  mapWrap: { flex: 1 },

  floatHeader: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  brandPillText: { fontFamily: fonts.displayBold, fontSize: 16, color: colors.onSurface },
  floatRight: { flexDirection: "row", gap: spacing.sm },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: { fontFamily: fonts.textBold, fontSize: 10, color: colors.onError },

  chipsWrap: { position: "absolute", left: 0, right: 0 },
  chipsRow: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  chip: {
    height: 36,
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    flexShrink: 0,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurface },
  chipTextActive: { color: colors.onBrand },

  panel: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: "46%",
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  panelHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: "center", marginBottom: spacing.md },
  panelHead: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  childName: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.onSurface },
  childMeta: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 2 },
  statusChip: { flexDirection: "row", alignItems: "center", gap: spacing.xs, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusChipText: { fontFamily: fonts.textBold, fontSize: 13 },

  absentBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  absentBannerText: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.warning },

  timeline: { marginTop: spacing.sm },
  step: { flexDirection: "row", gap: spacing.md },
  stepIndicator: { alignItems: "center", width: 34 },
  stepCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepCircleActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  stepCircleCurrent: { borderColor: colors.onSurface, borderWidth: 2 },
  stepLine: { width: 2, flex: 1, minHeight: 24, backgroundColor: colors.border, marginVertical: 2 },
  stepLineActive: { backgroundColor: colors.brand },
  stepBody: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: spacing.sm },
  stepLabel: { fontFamily: fonts.textMedium, fontSize: 15, color: colors.onSurfaceSecondary },
  stepLabelActive: { color: colors.onSurface, fontFamily: fonts.textBold },
  stepNow: { fontFamily: fonts.textBold, fontSize: 12, color: colors.brand },

  noTrip: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  noTripTitle: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.onSurface },
  noTripSub: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceSecondary, textAlign: "center", paddingHorizontal: spacing.lg },

  emptyAlerts: { fontFamily: fonts.text, fontSize: 14, color: colors.onSurfaceSecondary, textAlign: "center", paddingVertical: spacing.lg },
  alertRow: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  alertIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  alertTitle: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  alertMsg: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 2 },
  alertTime: { fontFamily: fonts.text, fontSize: 11, color: colors.onSurfaceSecondary, marginTop: 4, opacity: 0.7 },
});
