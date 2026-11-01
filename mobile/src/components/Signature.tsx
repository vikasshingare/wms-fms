import React, { useMemo } from "react";
import { PanResponder, Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { C, s } from "./ui";
export function Signature({
  points,
  onChange,
}: {
  points: string[];
  onChange: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          onChange((previous) => [
            ...previous,
            `M${x.toFixed(1)},${y.toFixed(1)}`,
          ]);
        },
        onPanResponderMove: (e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          onChange((previous) => {
            if (!previous.length) return [`M${x.toFixed(1)},${y.toFixed(1)}`];
            const next = [...previous];
            next[next.length - 1] += ` L${x.toFixed(1)},${y.toFixed(1)}`;
            return next;
          });
        },
      }),
    [onChange],
  );
  return (
    <View style={{ gap: 8 }}>
      <View style={s.split}>
        <Text style={s.fieldLabel}>
          Customer signature <Text style={s.small}>(optional)</Text>
        </Text>
        <Pressable onPress={() => onChange([])}>
          <Text style={s.link}>Clear</Text>
        </Pressable>
      </View>
      <View
        {...responder.panHandlers}
        style={
          {
            height: 140,
            backgroundColor: "#FFF",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#DFD8EE",
            overflow: "hidden",
            touchAction: "none",
          } as any
        }
      >
        <Svg width="100%" height="140">
          {points.map((path, i) => (
            <Path
              key={i}
              d={path}
              stroke={C.navy}
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
          ))}
        </Svg>
        {!points.length && (
          <Text
            pointerEvents="none"
            style={{
              position: "absolute",
              bottom: 17,
              left: 17,
              fontSize: 11,
              color: "#B7B0CA",
            }}
          >
            Sign here with a finger or pointer
          </Text>
        )}
      </View>
    </View>
  );
}
