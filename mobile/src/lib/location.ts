import * as Location from "expo-location";
export async function captureLocation() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted")
    throw new Error(
      "Location permission was not granted. You can retry, or check in without location if your site permits it.",
    );
  const current = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return {
    latitude: current.coords.latitude,
    longitude: current.coords.longitude,
  };
}
