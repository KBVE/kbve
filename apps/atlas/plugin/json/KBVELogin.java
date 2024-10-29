package net.runelite.client.plugins.microbot.kbve.json;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;
import java.util.Optional;

@Getter
@Setter
@ToString
public class KBVELogin {
    private String command = "login";
    private String username;
    private String password;
    private String bankpin;
    private int world;
    private String uuid;

    public KBVELogin(String username, String password, String bankpin, int world, String uuid) {
        this.username = username;
        this.password = password;
        this.bankpin = bankpin;
        this.world = world;
        // Use provided UUID or set a default if null or empty
        this.uuid = Optional.ofNullable(uuid).orElse("default-uuid");
    }
}