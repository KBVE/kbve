package com.kbve.statetree.client;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Client-side ship state tracker — mirrors the server's ShipManager
 * with just the data the client needs for rendering and interpolation.
 *
 * <p>Updated via network packets from the server. The client uses this
 * to know where ships are and smoothly interpolate between position
 * updates.
 */
public class ClientShipTracker {

    /** Tracked ships keyed by UUID string. */
    private final ConcurrentHashMap<String, ClientShipState> ships = new ConcurrentHashMap<>();

    /** Client-side ship state for rendering. */
    public static class ClientShipState {
        public final String shipId;
        public final String shipName;
        public final int sizeX, sizeY, sizeZ;

        // Current interpolated position
        public double x, y, z;
        public float heading;

        // Target position (from latest server update)
        public double targetX, targetY, targetZ;
        public float targetHeading;

        // Interpolation progress (0..1)
        public float lerpProgress = 1.0f;

        public ClientShipState(String shipId, String shipName,
                               double x, double y, double z,
                               int sizeX, int sizeY, int sizeZ) {
            this.shipId = shipId;
            this.shipName = shipName;
            this.x = x;
            this.y = y;
            this.z = z;
            this.targetX = x;
            this.targetY = y;
            this.targetZ = z;
            this.heading = 0;
            this.targetHeading = 0;
            this.sizeX = sizeX;
            this.sizeY = sizeY;
            this.sizeZ = sizeZ;
        }

        /** Tick interpolation toward target. */
        public void tick() {
            if (lerpProgress < 1.0f) {
                lerpProgress = Math.min(1.0f, lerpProgress + 0.1f);
                x = lerp(x, targetX, lerpProgress);
                y = lerp(y, targetY, lerpProgress);
                z = lerp(z, targetZ, lerpProgress);
                heading = lerpAngle(heading, targetHeading, lerpProgress);
            }
        }

        /** Set new target from server and reset interpolation. */
        public void setTarget(double tx, double ty, double tz, float th) {
            this.targetX = tx;
            this.targetY = ty;
            this.targetZ = tz;
            this.targetHeading = th;
            this.lerpProgress = 0.0f;
        }

        private static double lerp(double a, double b, float t) {
            return a + (b - a) * t;
        }

        private static float lerpAngle(float a, float b, float t) {
            float diff = ((b - a + 540) % 360) - 180;
            return a + diff * t;
        }
    }

    // -- Public API ---------------------------------------------------------

    public void addShip(String shipId, String name,
                        double x, double y, double z,
                        int sizeX, int sizeY, int sizeZ) {
        ships.put(shipId, new ClientShipState(shipId, name, x, y, z, sizeX, sizeY, sizeZ));
    }

    public void updateShipPosition(String shipId,
                                   double x, double y, double z,
                                   float heading) {
        ClientShipState state = ships.get(shipId);
        if (state != null) {
            state.setTarget(x, y, z, heading);
        }
    }

    public void removeShip(String shipId) {
        ships.remove(shipId);
    }

    public ClientShipState getShip(String shipId) {
        return ships.get(shipId);
    }

    public Map<String, ClientShipState> getAllShips() {
        return ships;
    }

    /** Tick all ship interpolations. Call each client tick. */
    public void tickAll() {
        for (ClientShipState ship : ships.values()) {
            ship.tick();
        }
    }
}
