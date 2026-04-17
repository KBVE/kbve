package com.kbve.statetree.command;

import java.util.List;

/**
 * One decoded intent from Rust — an entity target (or 0 for world) plus
 * a list of typed commands to apply. Epoch is used for staleness checks.
 */
public record DecodedIntent(int entityId, long epoch, List<AiCommand> commands) {}
