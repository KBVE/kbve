package net.runelite.client.plugins.microbot.kbve.json;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

@Getter
@Setter
@ToString
public class KBVEPlayerGPS {
    private String command;
    private String username;
    private int x;
    private int y;
    private int z;

    public KBVEPlayerGPS(String command, String username, int x, int y, int z) {
        this.command = command;
        this.username = username;
        this.x = x;
        this.y = y;
        this.z = z;
    }
}
