import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Redirect, router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useStore } from "../lib/store";
import {
  Button,
  C,
  ErrorText,
  Field,
  Icon,
  Logo,
  Screen,
  s,
} from "../components/ui";
const demo = process.env.EXPO_PUBLIC_DEMO_MODE !== "false";
export default function Login() {
  const { login, token, busy } = useStore();
  const [email, setEmail] = useState("rahul@service360.local"),
    [password, setPassword] = useState(demo ? "Service360!" : ""),
    [error, setError] = useState("");
  if (token) return <Redirect href="/(tabs)" />;
  const signIn = async () => {
    setError("");
    try {
      await login(email, password);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.login}
      >
        <View style={styles.top}>
          <View style={styles.orbit} />
          <Logo />
          <View style={styles.role}>
            <View style={styles.dot} />
            <Text style={styles.roleText}>FIELD ENGINEER WORKSPACE</Text>
          </View>
        </View>
        <View style={styles.form}>
          <Text style={styles.title}>Ready for the field.</Text>
          <Text style={s.body}>Your tasks, your inventory, one workspace.</Text>
          <View style={{ height: 13 }} />
          <Field
            label="Email address"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            onSubmitEditing={signIn}
          />
          <ErrorText error={error} />
          <Button
            title="Sign in"
            onPress={signIn}
            busy={busy}
            icon="arrow-right"
          />
          <View style={styles.local}>
            <Icon name="shield" size={14} color={C.muted} />
            <Text style={s.small}>Secure access for your field operations</Text>
          </View>
        </View>
        {demo && <LinearGradient colors={["#EEE9FF", "#F8F6FF"]} style={styles.demo}>
          <View style={s.row}>
            <Icon name="user-check" size={18} />
            <Text style={[s.sectionTitle, { fontSize: 13 }]}>
              Your local demo is ready
            </Text>
          </View>
          <Text style={s.small}>Rahul Sharma · Field Service Engineer</Text>
          <Text style={s.small}>The demo credentials are filled in above.</Text>
        </LinearGradient>}
        <Text style={styles.footer}>SERVICE360 / FIELD OPERATIONS / V1.0</Text>
      </KeyboardAvoidingView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  login: {
    minHeight: 740,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 30,
    gap: 34,
  },
  top: { alignItems: "center", paddingVertical: 29, gap: 25 },
  orbit: {
    position: "absolute",
    width: 225,
    height: 225,
    borderRadius: 120,
    borderWidth: 1,
    borderColor: "#E9E3F8",
    top: -50,
    opacity: 0.5,
  },
  role: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#EFEAFC",
  },
  dot: { height: 5, width: 5, borderRadius: 3, backgroundColor: C.purple },
  roleText: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1.25,
    color: C.purpleDark,
  },
  form: { gap: 15 },
  title: { fontSize: 28, fontWeight: "700", letterSpacing: -1, color: C.navy },
  local: {
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    marginTop: 2,
  },
  demo: {
    padding: 18,
    borderRadius: 14,
    gap: 7,
    borderWidth: 1,
    borderColor: "#E6DFFC",
  },
  footer: {
    fontSize: 8,
    letterSpacing: 1.3,
    textAlign: "center",
    color: "#A5A1B6",
    fontWeight: "600",
  },
});
