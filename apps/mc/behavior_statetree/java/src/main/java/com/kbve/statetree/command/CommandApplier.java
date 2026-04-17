package com.kbve.statetree.command;

/**
 * Applies a single typed command to the world. Each applier handles
 * exactly one {@link CommandKind} and receives a strongly-typed DTO.
 *
 * @param <T> the specific {@link AiCommand} subtype this applier handles
 */
@FunctionalInterface
public interface CommandApplier<T extends AiCommand> {

    /**
     * Execute the command. Appliers may assume the context is valid
     * (world non-null, mob non-null for mob commands) because the
     * executor validates before dispatching.
     */
    void apply(CommandContext ctx, T command);
}
