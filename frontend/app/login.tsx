import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import Button from "@/src/components/Button";
import { colors, fonts, radius, spacing } from "@/src/theme";

const DEMO = [
  { label: "Admin", phone: "+919000000001", icon: "shield-checkmark" },
  { label: "Driver", phone: "+919000000002", icon: "bus" },
  { label: "Parent", phone: "+919000000003", icon: "people" },
];

export default function Login() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { verifyOtp } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);

  const normalizePhone = (p: string) => {
    let v = p.trim().replace(/\s/g, "");
    if (!v.startsWith("+")) v = "+91" + v.replace(/^0+/, "");
    return v;
  };

  const sendOtp = async () => {
    const p = normalizePhone(phone);
    if (p.length < 10) return toast.show("Enter a valid phone number", "error");
    setLoading(true);
    try {
      const res = await api.sendOtp(p);
      setPhone(p);
      setStep("otp");
      setOtp(res.dev_otp || "");
      toast.show(`OTP sent (demo: ${res.dev_otp})`, "info");
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    if (otp.trim().length < 4) return toast.show("Enter the 4-digit OTP", "error");
    setLoading(true);
    try {
      const user = await verifyOtp(phone, otp.trim());
      toast.show(`Welcome, ${user.name}`, "success");
      router.replace(user.role === "admin" ? "/admin" : user.role === "driver" ? "/driver" : "/parent");
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Image
        source={{
          uri: "https://images.unsplash.com/photo-1527058918112-6e17a8213943?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
        }}
        style={styles.hero}
        contentFit="cover"
      />
      <LinearGradient
        colors={["rgba(15,17,21,0.2)", "rgba(15,17,21,0.85)", colors.surface]}
        style={styles.heroScrim}
      />

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + spacing.xl }}
        bottomOffset={24}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.brandWrap, { paddingTop: insets.top + spacing.xxxl }]}>
          <View style={styles.logoBadge}>
            <Ionicons name="location" size={28} color={colors.onBrand} />
          </View>
          <Text style={styles.brandName}>SafeRoute</Text>
          <Text style={styles.brandTag}>Live school transport tracking</Text>
        </View>

        <View style={styles.form}>
          {step === "phone" ? (
            <>
              <Text style={styles.label}>Phone Number</Text>
              <View style={styles.inputRow}>
                <Text style={styles.prefix}>🇮🇳 +91</Text>
                <TextInput
                  testID="phone-input"
                  style={styles.input}
                  placeholder="98765 43210"
                  placeholderTextColor={colors.onSurfaceSecondary}
                  keyboardType="phone-pad"
                  value={phone.replace("+91", "")}
                  onChangeText={setPhone}
                  maxLength={15}
                />
              </View>
              <Button
                testID="send-otp-button"
                label="Send OTP"
                onPress={sendOtp}
                loading={loading}
                style={{ marginTop: spacing.lg }}
              />

              <Text style={styles.demoTitle}>Quick demo login</Text>
              <View style={styles.demoRow}>
                {DEMO.map((d) => (
                  <Pressable
                    key={d.label}
                    testID={`demo-${d.label.toLowerCase()}-button`}
                    style={styles.demoChip}
                    onPress={() => {
                      setPhone(d.phone);
                    }}
                  >
                    <Ionicons name={d.icon as any} size={18} color={colors.brand} />
                    <Text style={styles.demoLabel}>{d.label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <>
              <Text style={styles.label}>Enter OTP</Text>
              <Text style={styles.sentTo}>Sent to {phone}</Text>
              <TextInput
                testID="otp-input"
                style={styles.otpInput}
                placeholder="0000"
                placeholderTextColor={colors.onSurfaceSecondary}
                keyboardType="number-pad"
                value={otp}
                onChangeText={setOtp}
                maxLength={4}
                autoFocus
              />
              <Button
                testID="verify-otp-button"
                label="Verify & Continue"
                onPress={verify}
                loading={loading}
                style={{ marginTop: spacing.lg }}
              />
              <Pressable
                testID="change-number-button"
                onPress={() => {
                  setStep("phone");
                  setOtp("");
                }}
                style={styles.backLink}
              >
                {loading ? (
                  <ActivityIndicator color={colors.onSurfaceSecondary} />
                ) : (
                  <Text style={styles.backText}>Change number</Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  hero: { position: "absolute", top: 0, left: 0, right: 0, height: 380 },
  heroScrim: { position: "absolute", top: 0, left: 0, right: 0, height: 380 },
  brandWrap: { alignItems: "center", paddingBottom: spacing.xxl },
  logoBadge: {
    width: 60,
    height: 60,
    borderRadius: radius.lg,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  brandName: { fontFamily: fonts.displayBold, fontSize: 40, color: colors.onSurface, letterSpacing: 1 },
  brandTag: { fontFamily: fonts.textMedium, fontSize: 14, color: colors.onSurfaceSecondary, marginTop: spacing.xs },
  form: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  label: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurfaceSecondary, marginBottom: spacing.sm, letterSpacing: 0.5 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    height: 60,
  },
  prefix: { fontFamily: fonts.textBold, fontSize: 17, color: colors.onSurface, marginRight: spacing.md },
  input: { flex: 1, fontFamily: fonts.textMedium, fontSize: 18, color: colors.onSurface, height: "100%" },
  sentTo: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceSecondary, marginBottom: spacing.lg },
  otpInput: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    height: 72,
    textAlign: "center",
    fontFamily: fonts.displayBold,
    fontSize: 34,
    letterSpacing: 12,
    color: colors.onSurface,
  },
  backLink: { alignItems: "center", paddingVertical: spacing.lg },
  backText: { fontFamily: fonts.textMedium, fontSize: 14, color: colors.onSurfaceSecondary },
  demoTitle: {
    fontFamily: fonts.textMedium,
    fontSize: 12,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
    letterSpacing: 0.5,
  },
  demoRow: { flexDirection: "row", gap: spacing.md, justifyContent: "center" },
  demoChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  demoLabel: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurface },
});
