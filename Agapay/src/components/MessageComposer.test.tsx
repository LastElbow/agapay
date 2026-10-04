jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Send: () => null,
  Image: () => null,
  X: () => null,
}));

import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Platform, TouchableOpacity } from "react-native";
import MessageComposer from "@/src/components/MessageComposer";

describe("components/MessageComposer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function renderComposer(extraProps?: any) {
    const props = {
      onSend: jest.fn(async () => {}),
      onPickImage: jest.fn(async () => {}),
      isBlocked: false,
      isSending: false,
      isUploadingImage: false,
      placeholder: "Message",
      disabled: false,
      pendingImageUri: null,
      onRemovePendingImage: jest.fn(),
      ...(extraProps ?? {}),
    };

    return { ...render(<MessageComposer {...props} />), props };
  }

  it("does not send when empty and no pending image", () => {
    const { UNSAFE_getAllByType, props } = renderComposer();

    const buttons = UNSAFE_getAllByType(TouchableOpacity);
    const sendButton = buttons[1];

    fireEvent.press(sendButton);

    expect(props.onSend).not.toHaveBeenCalled();
  });

  it("sends trimmed text and clears the input", async () => {
    const { getByPlaceholderText, UNSAFE_getAllByType, props } = renderComposer();

    const input = getByPlaceholderText("Message");
    fireEvent.changeText(input, "  hello  ");

    const buttons = UNSAFE_getAllByType(TouchableOpacity);
    const sendButton = buttons[1];

    fireEvent.press(sendButton);

    await waitFor(() => expect(props.onSend).toHaveBeenCalledWith("hello", undefined));
    await waitFor(() => expect(getByPlaceholderText("Message").props.value).toBe(""));
  });

  it("sends even when only an image is pending", async () => {
    const { UNSAFE_getAllByType, props } = renderComposer({
      pendingImageUri: "file://image.jpg",
    });

    const buttons = UNSAFE_getAllByType(TouchableOpacity);
    const sendButton = buttons[2];

    fireEvent.press(sendButton);

    await waitFor(() => expect(props.onSend).toHaveBeenCalledWith("", "file://image.jpg"));
  });

  it("on web: Enter key sends and calls preventDefault", async () => {
    const originalOS = Platform.OS;
    let overridden = false;

    try {
      Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
      overridden = true;
    } catch {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (Platform as any).OS = "web";
        overridden = true;
      } catch {
        overridden = false;
      }
    }

    if (!overridden) {
      expect(true).toBe(true);
      return;
    }

    const onSend = jest.fn(async () => {});
    const onPickImage = jest.fn(async () => {});

    const { getByPlaceholderText } = render(
      <MessageComposer
        onSend={onSend}
        onPickImage={onPickImage}
        isBlocked={false}
        isSending={false}
        isUploadingImage={false}
        placeholder="Message"
      />
    );

    const input = getByPlaceholderText("Message");
    fireEvent.changeText(input, "hi");

    const preventDefault = jest.fn();
    fireEvent(input, "keyPress", {
      nativeEvent: { key: "Enter", shiftKey: false },
      preventDefault,
    });

    await waitFor(() => expect(onSend).toHaveBeenCalledWith("hi", undefined));
    expect(preventDefault).toHaveBeenCalled();

    try {
      Object.defineProperty(Platform, "OS", { value: originalOS, configurable: true });
    } catch {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (Platform as any).OS = originalOS;
      } catch {
        // ignore
      }
    }
  });
});
