package com.kbve.statetree.client;

import com.kbve.statetree.ship.ShipEntity;
import net.minecraft.client.render.entity.EntityRenderer;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.render.entity.state.EntityRenderState;

/**
 * Entity renderer for {@link ShipEntity}. Currently renders the entity
 * as visible (not invisible) so the bounding box and name tag display.
 *
 * <p>TODO: Wire BBModelRenderer to the 1.21.11 render pipeline
 * (OrderedRenderCommandQueue). The BBModel .bbmodel files (airship,
 * biplane, gyrodyne) are loaded by BBModelLoader but the renderer
 * needs adaptation from the old VertexConsumerProvider API to the new
 * ordered render command queue system.
 *
 * <p>The entity architecture (modelName field, ShipManager spawn,
 * WASD controls) is fully wired — only the visual model rendering
 * remains as a follow-up.
 */
public class BBModelShipRenderer extends EntityRenderer<ShipEntity, EntityRenderState> {

    public BBModelShipRenderer(EntityRendererFactory.Context ctx) {
        super(ctx);
        this.shadowRadius = 2.0f;
    }

    @Override
    public EntityRenderState createRenderState() {
        return new EntityRenderState();
    }
}
