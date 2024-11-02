package net.runelite.client.plugins.microbot.kbve.json;

import com.google.gson.Gson;
import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

@Getter
@Setter
@ToString
public class KBVEHandshake {
    private String command;
    private String channel;
    private String content;
    private String timestamp;

    public KBVEHandshake(String command, String channel, String content, String timestamp) {
        this.command = command;
        this.channel = channel;
        this.content = content;
        this.timestamp = timestamp;
    }

    public static String createDefaultHandshakeJson() {
        KBVEHandshake handshake = new KBVEHandshake(
            "handshake",
            "default",
            "Hello, server! This is the handshake message.",
            String.valueOf(System.currentTimeMillis())
        );

        Gson gson = new Gson();
        return gson.toJson(handshake);
    }
}