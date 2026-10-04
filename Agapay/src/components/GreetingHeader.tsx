import { StyleSheet, Text, View } from "react-native";

type Props = {
  name: string;
};

export default function GreetingHeader({ name }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.avatar} />
      <View style={styles.textContainer}>
        <Text style={styles.greeting}>Welcome back,</Text>
        <Text style={styles.user}>{name}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 32,
  },
  avatar: {
    width: 60,
    height: 60,
    backgroundColor: "grey",
    borderRadius: 100,
  },
  textContainer: {
    justifyContent: "center",
  },
  greeting: {
    fontSize: 16,
    color: "#666",
  },
  user: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
});
