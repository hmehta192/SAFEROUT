import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, radius, spacing } from "@/src/theme";

type ToastType = "success" | "error" | "info";
type ToastCtx = { show: (msg: string, type?: ToastType) => void };

const Ctx = createContext<ToastCtx>({ show: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState("");
  const [type, setType] = useState<ToastType>("info");
  const [visible, setVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<any>(null);

  const show = useCallback(
    (m: string, t: ToastType = "info") => {
      setMsg(m);
      setType(t);
      setVisible(true);
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() =>
          setVisible(false)
        );
      }, 2800);
    },
    [opacity]
  );

  const color =
    type === "success" ? colors.success : type === "error" ? colors.error : colors.info;
  const icon =
    type === "success" ? "checkmark-circle" : type === "error" ? "alert-circle" : "information-circle";

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {visible && (
        <Animated.View
          pointerEvents="none"
          testID="app-toast"
          style={[styles.wrap, { top: insets.top + spacing.sm, opacity }]}
        >
          <View style={[styles.toast, { borderLeftColor: color }]}>
            <Ionicons name={icon as any} size={20} color={color} />
            <Text style={styles.text}>{msg}</Text>
          </View>
        </Animated.View>
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: spacing.lg, right: spacing.lg, zIndex: 9999, alignItems: "center" },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceTertiary,
    borderLeftWidth: 4,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    maxWidth: 480,
  },
  text: { flex: 1, color: colors.onSurface, fontFamily: fonts.textMedium, fontSize: 14 },
});
