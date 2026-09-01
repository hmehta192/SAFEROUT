import React from "react";
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle, View } from "react-native";
import * as Haptics from "expo-haptics";
import { colors, fonts, radius, spacing } from "@/src/theme";

type Props = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost" | "success";
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  style?: ViewStyle;
  large?: boolean;
  haptic?: "light" | "medium" | "heavy";
};

export default function Button({
  label,
  onPress,
  variant = "primary",
  loading,
  disabled,
  testID,
  style,
  large,
  haptic = "medium",
}: Props) {
  const bg = {
    primary: colors.brand,
    secondary: colors.surfaceTertiary,
    danger: colors.error,
    success: colors.success,
    ghost: "transparent",
  }[variant];

  const fg = {
    primary: colors.onBrand,
    secondary: colors.onSurface,
    danger: colors.onError,
    success: colors.onSuccess,
    ghost: colors.brand,
  }[variant];

  const handle = () => {
    if (disabled || loading) return;
    if (haptic === "heavy") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    else if (haptic === "light") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  return (
    <Pressable
      testID={testID}
      onPress={handle}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        large && styles.large,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        variant === "ghost" && styles.ghost,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          <Text style={[styles.label, large && styles.labelLarge, { color: fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 56,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  large: { height: 72, borderRadius: radius.lg },
  ghost: { borderWidth: 1, borderColor: colors.borderStrong },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  label: { fontFamily: fonts.textBold, fontSize: 16, letterSpacing: 0.3 },
  labelLarge: { fontFamily: fonts.displayBold, fontSize: 24, letterSpacing: 1 },
});
