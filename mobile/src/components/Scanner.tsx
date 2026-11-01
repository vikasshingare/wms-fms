import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Button, ErrorText, Field, Icon, s } from "./ui";
export function Scanner({
  visible,
  onClose,
  onScan,
}: {
  visible: boolean;
  onClose: () => void;
  onScan: (serial: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState("");
  const [camera, setCamera] = useState(false);
  const [error, setError] = useState("");
  const scan = (value: string) => {
    setCamera(false);
    onScan(value.trim());
    onClose();
  };
  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={s.split}>
            <View style={s.row}>
              <Icon name="maximize" />
              <Text style={s.sectionTitle}>Scan asset barcode</Text>
            </View>
            <Pressable onPress={onClose} accessibilityLabel="Close scanner">
              <Icon name="x" />
            </Pressable>
          </View>
          <Text style={s.body}>
            Scan the QR code or barcode on the asset label. You can also enter
            the serial number.
          </Text>
          {camera && permission?.granted ? (
            <View style={styles.camera}>
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{
                  barcodeTypes: [
                    "qr",
                    "code128",
                    "code39",
                    "ean13",
                    "ean8",
                    "datamatrix",
                  ],
                }}
                onBarcodeScanned={({ data }) => scan(data)}
              />
              <View pointerEvents="none" style={styles.target} />
            </View>
          ) : (
            <Button
              title="Open camera scanner"
              secondary
              icon="camera"
              onPress={async () => {
                try {
                  const p = permission?.granted
                    ? permission
                    : await requestPermission();
                  if (!p.granted)
                    throw new Error(
                      "Camera access was denied. Enter the serial manually below.",
                    );
                  setCamera(true);
                } catch (e: any) {
                  setError(e.message);
                }
              }}
            />
          )}
          <Field
            label="Serial number"
            placeholder="e.g. S360-POS-1001"
            value={manual}
            onChangeText={setManual}
            autoCapitalize="characters"
          />
          <ErrorText error={error} />
          <Button
            title="Use serial number"
            disabled={!manual.trim()}
            onPress={() => scan(manual)}
          />
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "#14112688",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  sheet: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 26,
    paddingBottom: 40,
    gap: 18,
  },
  camera: {
    height: 240,
    borderRadius: 15,
    overflow: "hidden",
    backgroundColor: "#111",
  },
  target: {
    position: "absolute",
    left: "15%",
    top: "25%",
    width: "70%",
    height: "50%",
    borderWidth: 2,
    borderColor: "#BAA3FF",
    borderRadius: 12,
  },
});
