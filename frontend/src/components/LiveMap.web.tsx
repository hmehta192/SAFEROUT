import React from "react";
import { StyleSheet, View, Text, ScrollView } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, radius, spacing } from "@/src/theme";

export type MapMarker = { lat: number; lng: number; title?: string; subtitle?: string };
type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

// Web fallback — react-native-maps has no web support. We render a styled map
// backdrop and a legend of the live pins so the data is still visible on web.
export default function LiveMap({ markers }: { region: Region; markers: MapMarker[] }) {
  const active = markers.length > 0;
  return (
    <View style={styles.container} testID="live-map">
      <Image
        source={{
          uri: "https://images.unsplash.com/photo-1506426305266-2b7e740fd828?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={styles.scrim} />
      {!active ? (
        <View style={styles.center}>
          <View style={[styles.busPin, { opacity: 0.5 }]}>
            <Ionicons name="bus" size={20} color={colors.onBrand} />
          </View>
          <Text style={styles.caption}>No active drivers right now</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.legend} showsVerticalScrollIndicator={false}>
          {markers.map((m, i) => (
            <View key={i} style={styles.legendRow} testID={`map-pin-${i}`}>
              <View style={styles.busPin}>
                <Ionicons name="bus" size={16} color={colors.onBrand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.legendTitle} numberOfLines={1}>{m.title}</Text>
                {!!m.subtitle && <Text style={styles.legendSub} numberOfLines={1}>{m.subtitle}</Text>}
              </View>
              <View style={styles.livePill}>
                <View style={styles.pulse} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, overflow: "hidden" },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,17,21,0.7)" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  caption: { color: colors.onSurfaceSecondary, fontFamily: fonts.textMedium, fontSize: 13 },
  legend: { padding: spacing.md, gap: spacing.sm },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: "rgba(28,31,38,0.9)",
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  busPin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#000",
  },
  legendTitle: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  legendSub: { fontFamily: fonts.text, fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 1 },
  livePill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,230,118,0.15)", borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  pulse: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  liveText: { fontFamily: fonts.textBold, fontSize: 10, color: colors.success, letterSpacing: 0.5 },
});
