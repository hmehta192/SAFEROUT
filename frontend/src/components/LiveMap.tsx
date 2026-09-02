import React from "react";
import { StyleSheet, View, Text } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { colors, fonts } from "@/src/theme";

export type MapMarker = { lat: number; lng: number; title?: string; subtitle?: string };

const darkStyle = [
  { elementType: "geometry", stylers: [{ color: "#1d2026" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0F1115" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#A1A7B3" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2b2f38" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212530" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0b0d11" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#232730" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1b2a1f" }] },
];

export default function LiveMap({
  region,
  markers,
}: {
  region: Region;
  markers: MapMarker[];
}) {
  return (
    <View style={styles.container} testID="live-map">
      <MapView
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        region={region}
        customMapStyle={darkStyle}
        showsUserLocation={false}
        toolbarEnabled={false}
      >
        {markers.map((m, i) => (
          <Marker
            key={i}
            coordinate={{ latitude: m.lat, longitude: m.lng }}
            title={m.title}
            description={m.subtitle}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={styles.pinWrap}>
              {!!m.title && (
                <View style={styles.label}>
                  <Text style={styles.labelText} numberOfLines={1}>
                    {m.title}
                  </Text>
                </View>
              )}
              <View style={styles.busPin}>
                <View style={styles.busDot} />
              </View>
            </View>
          </Marker>
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  pinWrap: { alignItems: "center" },
  label: {
    backgroundColor: colors.surfaceInverse,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 3,
    maxWidth: 160,
  },
  labelText: { fontFamily: fonts.textBold, fontSize: 11, color: colors.onSurfaceInverse },
  busPin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,171,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  busDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.brand, borderWidth: 2, borderColor: "#000" },
});
