package net.runelite.client.plugins.microbot.kbve;

//  [Microbot]
import net.runelite.client.plugins.microbot.Microbot;

//  [Runelite]
import net.runelite.client.ui.overlay.OverlayPanel;
import net.runelite.client.ui.overlay.OverlayPosition;
import net.runelite.client.ui.overlay.components.LineComponent;
import net.runelite.client.ui.overlay.components.TitleComponent;

//  [Java]
import javax.inject.Inject;
import java.awt.*;

public class KBVEOverlay extends OverlayPanel {
    @Inject
    KBVEOverlay(KBVEPlugin plugin) {
        super(plugin);
        setPosition(OverlayPosition.TOP_LEFT);
        setNaughty();
    }

    @Override
    public Dimension render(Graphics2D graphics) {
        try {
            panelComponent.setPreferredSize(new Dimension(300,300));
            panelComponent.getChildren().add(TitleComponent.builder()
                .text("KBVE Atlas" + KBVEPlugin.version)
                .color(Color.RED)
                .build()
            );

            panelComponent.getChildren().add(LineComponent.builder().build());

            panelComponent.getChildren().add(LineComponent.builder()
                    .left(Microbot.status)
                    .build());
        }
        catch (Exception ex) {
            System.out.println(ex.getMessage());
        }
        return super.render(graphics);
    }
}