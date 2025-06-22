package net.runelite.client.plugins.microbot.kbve.task;

import com.google.gson.Gson;
import lombok.extern.slf4j.Slf4j;
import net.runelite.client.plugins.microbot.kbve.json.KBVECommand;

import java.lang.reflect.Method;
import java.util.Arrays;

@Slf4j
public class TaskHandler {

    public static boolean handleCommand(KBVECommand command) {
        try {
            String fullClassName = command.getPackageName() + "." + command.getClassName();
            Class<?> clazz = Class.forName(fullClassName);

            Object[] args = command.getArgs();
            Class<?>[] argTypes = determineArgTypes(args);

            Object instance;
            try {
                instance = clazz.getConstructor(argTypes).newInstance(args);
            } catch (NoSuchMethodException e) {
                log.warn("[TaskHandler] No matching constructor. Falling back to default.");
                instance = clazz.getDeclaredConstructor().newInstance();
            }

            Method method = clazz.getMethod(command.getMethod(), argTypes);
            log.info("[TaskHandler] Invoking {} with args: {}", command.getMethod(), Arrays.toString(args));

            Object result = method.invoke(instance, args);
            log.info("[TaskHandler] Command Result: {}", result != null ? result : "void");

            return true;
        } catch (Exception e) {
            log.error("[TaskHandler] Command execution error: {}", e.getMessage(), e);
            return false;
        }
    }

    private static Class<?>[] determineArgTypes(Object[] args) {
        Class<?>[] types = new Class<?>[args.length];
        for (int i = 0; i < args.length; i++) {
            if (args[i] instanceof Integer) types[i] = int.class;
            else if (args[i] instanceof Double d && d % 1 == 0) {
                args[i] = d.intValue();
                types[i] = int.class;
            } else if (args[i] instanceof Double) types[i] = double.class;
            else if (args[i] instanceof Boolean) types[i] = boolean.class;
            else if (args[i] instanceof String) types[i] = String.class;
            else types[i] = Object.class;
        }
        return types;
    }
}
