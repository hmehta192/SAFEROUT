import React from "react";
import { StyleSheet, View, Text } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, spacing } from "@/src/theme";

export type MapMarker = { lat: number; lng: number; title?: string };
type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

// Web fallback — react-native-maps has no web support.
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
      <View style={styles.center}>
        <View style={[styles.busPin, !active && { opacity: 0.5 }]}>
          <Ionicons name="bus" size={22} color={colors.onBrand} />
        </View>
        <Text style={styles.caption}>
          {active ? "Live vehicle position" : "Map preview (mobile shows live map)"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, overflow: "hidden" },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,17,21,0.55)" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  busPin: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#000",
  },
  caption: { color: colors.onSurfaceSecondary, fontFamily: fonts.textMedium, fontSize: 13 },
});
