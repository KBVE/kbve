package net.runelite.client.plugins.microbot.kbve.json;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;
import net.runelite.api.coords.WorldPoint;
import net.runelite.client.plugins.microbot.util.walker.Rs2Walker;

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

  /**
   * Processes the current GPS command.
   *
   * @return true if the command was successfully executed, false otherwise.
   */
  public boolean processCommand() {
    if (command == null || command.isEmpty()) {
      System.out.println("[KBVEPlayerGPS]: Invalid command.");
      return false;
    }

    switch (command.toUpperCase()) {
      case "WALK":
        return executeWalk();
      case "STOP":
        System.out.println("[KBVEPlayerGPS]: Stop command received (No-op).");
        return true;
      default:
        System.out.println("[KBVEPlayerGPS]: Unknown command: " + command);
        return false;
    }
  }

  /**
   * Executes the WALK command by invoking Rs2Walker.walkTo().
   *
   * @return true if the walk command was successfully initiated, false otherwise.
   */
  private boolean executeWalk() {
    try {
      WorldPoint target = new WorldPoint(x, y, z);
      System.out.println("[KBVEPlayerGPS]: Walking to " + target);
      return Rs2Walker.walkTo(target);
    } catch (Exception e) {
      System.out.println(
        "[KBVEPlayerGPS]: Error while executing WALK command - " +
        e.getMessage()
      );
      e.printStackTrace();
      return false;
    }
  }
}
