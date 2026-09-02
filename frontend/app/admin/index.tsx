import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import Button from "@/src/components/Button";
import Sheet from "@/src/components/Sheet";
import LiveMap from "@/src/components/LiveMap";
import { colors, fonts, radius, spacing, statusColor, statusLabel } from "@/src/theme";

const TABS = ["Overview", "Drivers", "Parents", "Students", "Batches", "Subscriptions"];

const fmtTime = (iso?: string) => {
  if (!iso) return "--";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "--";
  }
};
const fmtDateTime = (iso?: string) => {
  if (!iso) return "--";
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return "--";
  }
};

export default function AdminDashboard() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const toast = useToast();
  const router = useRouter();

  const doLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const [tab, setTab] = useState("Overview");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [overview, setOverview] = useState<any>(null);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [parents, setParents] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);

  const [sheet, setSheet] = useState<null | "driver" | "parent" | "batch" | "student" | "sub">(null);
  const [subTarget, setSubTarget] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [o, d, p, s, b, al] = await Promise.all([
        api.adminOverview(),
        api.adminDrivers(),
        api.adminParents(),
        api.adminStudents(),
        api.adminBatches(),
        api.adminAlerts(),
      ]);
      setOverview(o);
      setDrivers(d);
      setParents(p);
      setStudents(s);
      setBatches(b);
      setAlerts(al);
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
    const iv = setInterval(load, 8000);
    return () => clearInterval(iv);
  }, [load, user]);

  const openSheet = (type: any, target?: any) => {
    setForm(target?.subscription ? { plan: target.subscription.plan, status: target.subscription.status } : { plan: "monthly", status: "active", section: "A" });
    setSubTarget(target || null);
    setSheet(type);
  };

  const submit = async () => {
    setSaving(true);
    try {
      if (sheet === "driver") {
        if (!form.name || !form.phone || !form.vehicle_number) throw new Error("Fill all required fields");
        await api.addDriver(form);
      } else if (sheet === "parent") {
        if (!form.name || !form.phone) throw new Error("Fill all required fields");
        await api.addParent(form);
      } else if (sheet === "batch") {
        if (!form.name || !form.driver_id) throw new Error("Name and driver are required");
        await api.addBatch(form);
      } else if (sheet === "student") {
        if (!form.name || !form.parent_id || !form.batch_id) throw new Error("Fill all required fields");
        await api.addStudent(form);
      } else if (sheet === "sub") {
        await api.updateSubscription(subTarget.id, form.plan, form.status);
      }
      toast.show("Saved", "success");
      setSheet(null);
      load();
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const del = async (type: string, id: string) => {
    try {
      if (type === "driver") await api.deleteDriver(id);
      else if (type === "parent") await api.deleteParent(id);
      else if (type === "student") await api.deleteStudent(id);
      toast.show("Removed", "info");
      load();
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  const c = overview?.counts || {};
  const unreadAlerts = alerts.filter((a) => !a.read).length;
  const openAlerts = async () => {
    setShowAlerts(true);
    try {
      await api.adminReadAll();
      setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    } catch {}
  };
  const alertColor = (t: string) =>
    t === "absent" || t === "driver_unavailable" ? colors.error : t === "batch_change" ? colors.warning : colors.info;
  const alertIcon = (t: string) =>
    t === "absent" ? "person-remove" : t === "batch_change" ? "swap-horizontal" : t === "driver_unavailable" ? "warning" : "bus";

  const activeTrips = overview?.active_trips || [];
  const absentStudents = overview?.absent_students || [];
  const mapMarkers = activeTrips
    .filter((t: any) => t.current_lat != null && t.current_lng != null)
    .map((t: any) => ({
      lat: t.current_lat,
      lng: t.current_lng,
      title: `${(t.driver_name || "").split(" ")[0]} · ${t.students_on_board} on board`,
      subtitle: t.batch_name,
    }));
  const firstMarker = mapMarkers[0];
  const mapRegion = {
    latitude: firstMarker?.lat ?? 30.7333,
    longitude: firstMarker?.lng ?? 76.7794,
    latitudeDelta: 0.06,
    longitudeDelta: 0.06,
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hi}>Admin</Text>
          <Text style={styles.name}>{user?.name}</Text>
        </View>
        <Pressable testID="admin-alerts-button" onPress={openAlerts} style={[styles.iconBtn, { marginRight: spacing.sm }]} hitSlop={10}>
          <Ionicons name="notifications" size={22} color={colors.onSurface} />
          {unreadAlerts > 0 && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{unreadAlerts}</Text>
            </View>
          )}
        </Pressable>
        <Pressable testID="logout-button" onPress={doLogout} style={styles.iconBtn} hitSlop={10}>
          <Ionicons name="log-out-outline" size={22} color={colors.onSurfaceSecondary} />
        </Pressable>
      </View>

      {/* Tabs */}
      <View style={styles.tabsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
          {TABS.map((t) => (
            <Pressable
              key={t}
              testID={`tab-${t.toLowerCase()}`}
              onPress={() => setTab(t)}
              style={[styles.tab, tab === t && styles.tabActive]}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxxl }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />
        }
      >
        {tab === "Overview" && (
          <View testID="overview-tab">
            <View style={styles.metricGrid}>
              <Metric label="Active Trips" value={c.active_trips} accent={colors.success} icon="pulse" />
              <Metric label="Drivers" value={c.drivers} icon="bus" />
              <Metric label="Parents" value={c.parents} icon="people" />
              <Metric label="Students" value={c.students} icon="school" />
              <Metric label="Active Subs" value={c.active_subscriptions} accent={colors.brand} icon="card" />
            </View>

            {/* Live map of all active drivers */}
            <View style={styles.liveHeaderRow}>
              <Text style={styles.sectionTitle}>Live Fleet Map</Text>
              <View style={styles.autoPill}>
                <View style={styles.autoDot} />
                <Text style={styles.autoText}>Auto-updating</Text>
              </View>
            </View>
            <View style={styles.mapCard} testID="admin-live-map">
              <LiveMap region={mapRegion} markers={mapMarkers} />
            </View>

            {/* Detailed active trips */}
            <Text style={styles.sectionTitle}>On Trip Right Now</Text>
            {activeTrips.length === 0 && <Text style={styles.empty}>No active trips right now.</Text>}
            {activeTrips.map((t: any) => (
              <View key={t.id} style={styles.tripBigCard} testID={`active-trip-${t.id}`}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tripDriver}>{t.driver_name}</Text>
                    <Text style={styles.cardMeta}>{t.vehicle_number} · {t.batch_name}</Text>
                  </View>
                  <View style={[styles.statusChip, { backgroundColor: statusColor(t.status) + "22" }]}>
                    <View style={[styles.statusDotSmall, { backgroundColor: statusColor(t.status) }]} />
                    <Text style={[styles.statusChipText, { color: statusColor(t.status) }]}>{statusLabel(t.status)}</Text>
                  </View>
                </View>

                <View style={styles.tripStats}>
                  <View style={styles.tripStat}>
                    <Text style={styles.tripStatValue}>{t.students_on_board}<Text style={styles.tripStatOf}>/{t.total_students}</Text></Text>
                    <Text style={styles.tripStatLabel}>On board</Text>
                  </View>
                  <View style={styles.tripStatDivider} />
                  <View style={styles.tripStat}>
                    <Text style={styles.tripStatValue}>{fmtTime(t.started_at)}</Text>
                    <Text style={styles.tripStatLabel}>Started</Text>
                  </View>
                  <View style={styles.tripStatDivider} />
                  <View style={styles.tripStat}>
                    <Text style={styles.tripStatValue}>{fmtTime(t.updated_at)}</Text>
                    <Text style={styles.tripStatLabel}>Last update</Text>
                  </View>
                </View>

                <Text style={styles.rosterLabel}>Students on board</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rosterRow}>
                  {t.students.filter((s: any) => !s.absent).map((s: any, idx: number) => (
                    <View key={idx} style={styles.rosterChip}>
                      <Text style={styles.rosterName}>{s.name}</Text>
                      <Text style={styles.rosterMeta}>Class {s.class_grade} · {s.section}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ))}

            {/* Absent today */}
            <Text style={styles.sectionTitle}>Absent Today ({absentStudents.length})</Text>
            {absentStudents.length === 0 && <Text style={styles.empty}>No students absent today.</Text>}
            {absentStudents.map((s: any) => (
              <View key={s.id} style={styles.absentRow} testID={`absent-student-${s.id}`}>
                <View style={styles.absentIcon}>
                  <Ionicons name="person-remove" size={16} color={colors.error} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{s.name}</Text>
                  <Text style={styles.cardMeta}>Class {s.class_grade} · Section {s.section} · {s.batch_name}</Text>
                  <Text style={styles.updatedText}>Marked at {fmtDateTime(s.updated_at)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {tab === "Drivers" && (
          <View testID="drivers-tab">
            <AddBtn label="Add Driver" onPress={() => openSheet("driver")} testID="add-driver-button" />
            {drivers.map((d) => (
              <EntityRow
                key={d.id}
                title={d.name}
                subtitle={`${d.phone} · ${d.vehicle_number}`}
                icon="bus"
                onDelete={() => del("driver", d.id)}
                testID={`driver-${d.id}`}
              />
            ))}
          </View>
        )}

        {tab === "Parents" && (
          <View testID="parents-tab">
            <AddBtn label="Add Parent" onPress={() => openSheet("parent")} testID="add-parent-button" />
            {parents.map((p) => (
              <EntityRow
                key={p.id}
                title={p.name}
                subtitle={p.phone}
                icon="people"
                onDelete={() => del("parent", p.id)}
                testID={`parent-${p.id}`}
              />
            ))}
          </View>
        )}

        {tab === "Students" && (
          <View testID="students-tab">
            <AddBtn label="Add Student" onPress={() => openSheet("student")} testID="add-student-button" />
            {students.map((s) => (
              <EntityRow
                key={s.id}
                title={s.name}
                subtitle={`Class ${s.class_grade} · Section ${s.section} · ${s.batch_name}`}
                detail={`Parent: ${s.parent_name} · Updated ${fmtDateTime(s.updated_at)}`}
                icon="school"
                onDelete={() => del("student", s.id)}
                testID={`student-${s.id}`}
              />
            ))}
          </View>
        )}

        {tab === "Batches" && (
          <View testID="batches-tab">
            <AddBtn label="Add Batch" onPress={() => openSheet("batch")} testID="add-batch-button" />
            {batches.map((b) => (
              <View key={b.id} style={styles.card} testID={`batch-${b.id}`}>
                <Text style={styles.cardTitle}>{b.name}</Text>
                <Text style={styles.cardMeta}>{b.school_name} · {b.pickup_time}</Text>
                <Text style={styles.cardMeta}>Driver: {b.driver_name} · {b.student_count} students</Text>
              </View>
            ))}
          </View>
        )}

        {tab === "Subscriptions" && (
          <View testID="subscriptions-tab">
            <Text style={styles.subHint}>Per-child plans. Monthly ₹800 · Annual ₹8000.</Text>
            {students.map((s) => (
              <Pressable key={s.id} style={styles.card} onPress={() => openSheet("sub", s)} testID={`sub-${s.id}`}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>{s.name}</Text>
                  <View
                    style={[
                      styles.statusChip,
                      { backgroundColor: (s.subscription?.status === "active" ? colors.success : colors.error) + "22" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusChipText,
                        { color: s.subscription?.status === "active" ? colors.success : colors.error },
                      ]}
                    >
                      {s.subscription?.status === "active" ? "Active" : "Expired"}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardMeta}>
                  {(s.subscription?.plan || "monthly").toUpperCase()} · ₹{s.subscription?.amount} · {s.parent_name}
                </Text>
                <Text style={styles.editHint}>Tap to edit plan →</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Add / edit sheet */}
      <Sheet
        visible={!!sheet}
        onClose={() => setSheet(null)}
        title={
          sheet === "driver" ? "Add Driver" :
          sheet === "parent" ? "Add Parent" :
          sheet === "batch" ? "Add Batch" :
          sheet === "student" ? "Add Student" :
          "Edit Subscription"
        }
        testID="admin-sheet"
        footer={<Button label="Save" onPress={submit} loading={saving} testID="sheet-save-button" />}
      >
        {sheet === "driver" && (
          <>
            <Field label="Full Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} testID="f-name" />
            <Field label="Phone (+91…)" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} keyboard="phone-pad" testID="f-phone" />
            <Field label="Vehicle Number" value={form.vehicle_number} onChange={(v) => setForm({ ...form, vehicle_number: v })} testID="f-vehicle" />
            <Field label="Vehicle Label (optional)" value={form.vehicle_label} onChange={(v) => setForm({ ...form, vehicle_label: v })} testID="f-vlabel" />
          </>
        )}
        {sheet === "parent" && (
          <>
            <Field label="Full Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} testID="f-name" />
            <Field label="Phone (+91…)" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} keyboard="phone-pad" testID="f-phone" />
          </>
        )}
        {sheet === "batch" && (
          <>
            <Field label="Batch Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} testID="f-name" />
            <Field label="School Name" value={form.school_name} onChange={(v) => setForm({ ...form, school_name: v })} testID="f-school" />
            <Field label="Pickup Time" value={form.pickup_time} onChange={(v) => setForm({ ...form, pickup_time: v })} testID="f-time" />
            <Selector
              label="Assign Driver"
              options={drivers.map((d) => ({ id: d.id, label: `${d.name} (${d.vehicle_number})` }))}
              value={form.driver_id}
              onSelect={(id) => setForm({ ...form, driver_id: id })}
            />
          </>
        )}
        {sheet === "student" && (
          <>
            <Field label="Student Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} testID="f-name" />
            <Field label="Class / Grade" value={form.class_grade} onChange={(v) => setForm({ ...form, class_grade: v })} testID="f-class" />
            <Selector
              label="Section"
              options={[{ id: "A", label: "Section A" }, { id: "B", label: "Section B" }]}
              value={form.section}
              onSelect={(id) => setForm({ ...form, section: id })}
            />
            <Selector
              label="Parent"
              options={parents.map((p) => ({ id: p.id, label: `${p.name} (${p.phone})` }))}
              value={form.parent_id}
              onSelect={(id) => setForm({ ...form, parent_id: id })}
            />
            <Selector
              label="Batch"
              options={batches.map((b) => ({ id: b.id, label: b.name }))}
              value={form.batch_id}
              onSelect={(id) => setForm({ ...form, batch_id: id })}
            />
            <Selector
              label="Plan"
              options={[{ id: "monthly", label: "Monthly ₹800" }, { id: "annual", label: "Annual ₹8000" }]}
              value={form.plan}
              onSelect={(id) => setForm({ ...form, plan: id })}
            />
          </>
        )}
        {sheet === "sub" && (
          <>
            <Text style={styles.subChild}>{subTarget?.name}</Text>
            <Selector
              label="Plan"
              options={[{ id: "monthly", label: "Monthly ₹800" }, { id: "annual", label: "Annual ₹8000" }]}
              value={form.plan}
              onSelect={(id) => setForm({ ...form, plan: id })}
            />
            <Selector
              label="Status"
              options={[{ id: "active", label: "Active" }, { id: "expired", label: "Expired" }]}
              value={form.status}
              onSelect={(id) => setForm({ ...form, status: id })}
            />
          </>
        )}
      </Sheet>

      {/* Notifications feed */}
      <Sheet visible={showAlerts} onClose={() => setShowAlerts(false)} title="Notifications" testID="admin-alerts-sheet">
        {alerts.length === 0 && <Text style={styles.empty}>No notifications yet.</Text>}
        {alerts.map((a) => (
          <View key={a.id} style={styles.alertRow} testID={`admin-alert-${a.id}`}>
            <View style={[styles.alertIcon, { backgroundColor: alertColor(a.type) + "22" }]}>
              <Ionicons name={alertIcon(a.type) as any} size={18} color={alertColor(a.type)} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{a.title}</Text>
              <Text style={styles.cardMeta}>{a.message}</Text>
              <Text style={styles.alertTime}>{new Date(a.created_at).toLocaleString()}</Text>
            </View>
          </View>
        ))}
      </Sheet>
    </View>
  );
}

function Metric({ label, value, accent, icon }: any) {
  return (
    <View style={styles.metric}>
      <Ionicons name={icon} size={18} color={accent || colors.onSurfaceSecondary} />
      <Text style={[styles.metricValue, accent && { color: accent }]}>{value ?? 0}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function AddBtn({ label, onPress, testID }: any) {
  return (
    <Pressable testID={testID} onPress={onPress} style={styles.addBtn}>
      <Ionicons name="add-circle" size={20} color={colors.onBrand} />
      <Text style={styles.addBtnText}>{label}</Text>
    </Pressable>
  );
}

function EntityRow({ title, subtitle, detail, icon, onDelete, testID }: any) {
  return (
    <View style={styles.entityRow} testID={testID}>
      <View style={styles.entityIcon}>
        <Ionicons name={icon} size={18} color={colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardMeta}>{subtitle}</Text>
        {!!detail && <Text style={styles.updatedText}>{detail}</Text>}
      </View>
      <Pressable testID={`${testID}-delete`} onPress={onDelete} hitSlop={8} style={styles.delBtn}>
        <Ionicons name="trash-outline" size={18} color={colors.error} />
      </Pressable>
    </View>
  );
}

function Field({ label, value, onChange, keyboard, testID }: any) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        style={styles.fieldInput}
        value={value || ""}
        onChangeText={onChange}
        keyboardType={keyboard || "default"}
        placeholderTextColor={colors.onSurfaceSecondary}
      />
    </View>
  );
}

function Selector({ label, options, value, onSelect }: any) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.selectorWrap}>
        {options.map((o: any) => {
          const active = value === o.id;
          return (
            <Pressable
              key={o.id}
              testID={`select-${o.id}`}
              onPress={() => onSelect(o.id)}
              style={[styles.selectorChip, active && styles.selectorChipActive]}
            >
              <Text style={[styles.selectorText, active && styles.selectorTextActive]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  hi: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.onSurfaceSecondary, letterSpacing: 1, textTransform: "uppercase" },
  name: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.onSurface },
  iconBtn: { padding: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md },
  headerBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  headerBadgeText: { fontFamily: fonts.textBold, fontSize: 10, color: colors.onError },
  alertRow: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  alertIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  alertTime: { fontFamily: fonts.text, fontSize: 11, color: colors.onSurfaceSecondary, marginTop: 4, opacity: 0.7 },

  tabsWrap: { height: 56, borderBottomWidth: 1, borderBottomColor: colors.divider },
  tabsRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center" },
  tab: { height: 36, justifyContent: "center", paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, flexShrink: 0 },
  tabActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabText: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurfaceSecondary },
  tabTextActive: { color: colors.onBrand },

  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  metric: { width: "47%", flexGrow: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.xs },
  metricValue: { fontFamily: fonts.displayBold, fontSize: 34, color: colors.onSurface },
  metricLabel: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.onSurfaceSecondary },

  sectionTitle: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.onSurface, marginTop: spacing.xl, marginBottom: spacing.md },
  empty: { fontFamily: fonts.text, fontSize: 14, color: colors.onSurfaceSecondary },

  liveHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xl },
  autoPill: { flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: "rgba(0,230,118,0.14)", borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4 },
  autoDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  autoText: { fontFamily: fonts.textBold, fontSize: 11, color: colors.success },
  mapCard: { height: 240, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border, marginTop: spacing.md },

  tripBigCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  tripDriver: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.onSurface },
  statusDotSmall: { width: 7, height: 7, borderRadius: 4 },
  tripStats: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingVertical: spacing.md, marginTop: spacing.md },
  tripStat: { flex: 1, alignItems: "center" },
  tripStatValue: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.onSurface },
  tripStatOf: { fontFamily: fonts.displayMedium, fontSize: 14, color: colors.onSurfaceSecondary },
  tripStatLabel: { fontFamily: fonts.text, fontSize: 11, color: colors.onSurfaceSecondary, marginTop: 2 },
  tripStatDivider: { width: 1, height: 32, backgroundColor: colors.border },
  rosterLabel: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.onSurfaceSecondary, marginTop: spacing.md, marginBottom: spacing.sm },
  rosterRow: { gap: spacing.sm, paddingRight: spacing.md },
  rosterChip: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border, minWidth: 120 },
  rosterName: { fontFamily: fonts.textBold, fontSize: 13, color: colors.onSurface },
  rosterMeta: { fontFamily: fonts.text, fontSize: 11, color: colors.onSurfaceSecondary, marginTop: 2 },

  absentRow: { flexDirection: "row", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  absentIcon: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: "rgba(255,61,0,0.15)", alignItems: "center", justifyContent: "center" },
  updatedText: { fontFamily: fonts.text, fontSize: 11, color: colors.onSurfaceSecondary, marginTop: 4, opacity: 0.8 },

  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontFamily: fonts.textBold, fontSize: 16, color: colors.onSurface },
  cardMeta: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 2 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusChip: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  statusChipText: { fontFamily: fonts.textBold, fontSize: 12 },
  editHint: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.brand, marginTop: spacing.sm },
  subHint: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceSecondary, marginBottom: spacing.md },

  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brand, borderRadius: radius.md, height: 50, marginBottom: spacing.lg },
  addBtnText: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onBrand },

  entityRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  entityIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  delBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },

  fieldLabel: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurfaceSecondary, marginBottom: spacing.xs },
  fieldInput: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, height: 50, paddingHorizontal: spacing.lg, fontFamily: fonts.textMedium, fontSize: 15, color: colors.onSurface, borderWidth: 1, borderColor: colors.border },
  selectorWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  selectorChip: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border },
  selectorChipActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
  selectorText: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurfaceSecondary },
  selectorTextActive: { color: colors.brand },
  subChild: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.onSurface, marginBottom: spacing.md },
});
