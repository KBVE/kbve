package net.runelite.client.plugins.microbot.kbve;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

@Getter
@Setter
@ToString
public class KBVECommand {
    private String command;
    private String packageName;
    private String className;
    private String method;
    private String[] args;
    private int priority;

    public KBVECommand(String command, String packageName, String className, String method, String[] args, int priority) {
        this.command = command;
        this.packageName = packageName;
        this.className = className;
        this.method = method;
        this.args = args;
        this.priority = priority;
    }
}
