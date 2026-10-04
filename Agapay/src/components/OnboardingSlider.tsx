import React, { useRef, useState } from "react";
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const { width: screenWidth } = Dimensions.get("window");
const PRIMARY = "#3B82F6";

const slides = [
  {
    title: "Welcome!",
    description: "To begin, please tell us how you'll be using the app",
  },
  {
    title: "Find a Therapist",
    description: "Search and book sessions with professionals.",
  },
  {
    title: "Manage Sessions",
    description: "Keep track of upcoming appointments.",
  },
];

export default function OnboardingSlider() {
  const [activeSlide, setActiveSlide] = useState(0);
  const scrollRef = useRef<ScrollView | null>(null);

  const [containerWidth, setContainerWidth] = useState(screenWidth);

  const onScrollViewLayout = (event: any) => {
    const { width } = event.nativeEvent.layout;
    // Account for ScrollView borders (2px on each side = 4px total)
    const availableWidth = width - 4;
    setContainerWidth(availableWidth);
  };

  const handleScroll = (event: any) => {
    const slideIndex = Math.round(
      event.nativeEvent.contentOffset.x / containerWidth
    );
    // Ensure we don't go beyond the available slides
    const clampedIndex = Math.max(0, Math.min(slideIndex, slides.length - 1));
    setActiveSlide(clampedIndex);
  };

  const goToSlide = (index: number) => {
    // Ensure we don't go beyond available slides
    const clampedIndex = Math.max(0, Math.min(index, slides.length - 1));
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        x: clampedIndex * containerWidth,
        animated: true,
      });
      setActiveSlide(clampedIndex);
    }
  };

  return (
    <>
      <View style={styles.sliderContainer}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          bounces={false}
          scrollEventThrottle={16}
          style={styles.scrollView}
          onLayout={onScrollViewLayout}
          contentContainerStyle={{
            width: containerWidth * slides.length,
          }}
        >
          {slides.map((slide, index) => (
            <View
              key={index}
              style={[
                styles.slide,
                {
                  width: containerWidth,
                  marginHorizontal: 0,
                  marginVertical: 0,
                },
              ]}
            >
              <View style={styles.slideContent}>
                <Text style={styles.slideTitle}>{slide.title}</Text>
                <Text style={styles.slideDesc}>{slide.description}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.dotsContainer}>
        {slides.map((_, index) => (
          <TouchableOpacity
            key={index}
            onPress={() => goToSlide(index)}
            activeOpacity={0.8}
            style={[styles.dot, activeSlide === index && styles.activeDot]}
          />
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sliderContainer: {
    height: 120,
    marginTop: 6,
    width: "100%",
    borderWidth: 0,
    // borderColor: "red",
  },
  scrollView: {
    flex: 1,
    // borderWidth: 2,
    // borderColor: "blue",
  },
  slide: {
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    // borderWidth: 2,
    // borderColor: "red",

    margin: 0,
    padding: 0,
  },
  slideContent: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    width: "100%",
  },
  slideTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111",
    textAlign: "center",
    marginBottom: 8,
  },
  slideDesc: {
    fontSize: 13,

    textAlign: "center",
    lineHeight: 18,
  },
  dotsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    margin: 6,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 10,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 6,
  },
  activeDot: {
    backgroundColor: PRIMARY,
    width: 22,
    borderRadius: 12,
  },
});
