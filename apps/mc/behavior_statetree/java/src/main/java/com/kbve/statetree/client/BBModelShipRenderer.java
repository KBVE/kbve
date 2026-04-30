package com.kbve.statetree.client;

import com.kbve.statetree.bbmodel.BBAnimation;
import com.kbve.statetree.bbmodel.BBAnimator;
import com.kbve.statetree.bbmodel.BBBone;
import com.kbve.statetree.bbmodel.BBFace;
import com.kbve.statetree.bbmodel.BBFaceContainer;
import com.kbve.statetree.bbmodel.BBModel;
import com.kbve.statetree.bbmodel.BBModelLoader;
import com.kbve.statetree.bbmodel.BBModelUtils;
import com.kbve.statetree.bbmodel.BBObject;
import org.joml.Vector3f;
import com.kbve.statetree.ship.ShipEntity;
import net.minecraft.client.render.OverlayTexture;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.render.RenderLayers;
import net.minecraft.client.render.command.OrderedRenderCommandQueue;
import net.minecraft.client.render.entity.EntityRenderer;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.render.state.CameraRenderState;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.util.Identifier;
import org.joml.Quaternionf;

/**
 * Entity renderer for {@link ShipEntity} that draws a BBModel. Walks the
 * model tree and submits one custom render command per face, bundling
 * matrix state into each submission so the command queue can batch
 * vertices by render layer.
 *
 * <p>Pipeline:
 * <pre>
 *   render(state, matrices, queue)
 *     → apply ship-level rotation
 *     → recursiveRender(root BBObjects)
 *       ├─ BBBone  → push transform, recurse into children
 *       └─ BBCube / BBMesh → submitCustom(matrices, layer, face-emitter)
 * </pre>
 *
 * <p>Adapted from the old ImmersiveAircraft-derived {@code BBModelRenderer}
 * (which used {@code VertexConsumerProvider}) to the 1.21.11
 * {@link OrderedRenderCommandQueue} pipeline.
 */
public class BBModelShipRenderer extends EntityRenderer<ShipEntity, ShipRenderState> {

    /** Fallback if the entity's modelName is empty or unregistered. */
    private static final String DEFAULT_MODEL = "immersive_aircraft/airship";
    private static final java.util.Set<String> MISSING_MODELS_LOGGED =
            java.util.concurrent.ConcurrentHashMap.newKeySet();

    /** Blockbench units → world blocks (1/16). */
    private static final float MODEL_SCALE = 1.0f / 16.0f;

    public BBModelShipRenderer(EntityRendererFactory.Context ctx) {
        super(ctx);
        this.shadowRadius = 2.0f;
    }

    // -- State lifecycle ----------------------------------------------------

    @Override
    public ShipRenderState createRenderState() {
        return new ShipRenderState();
    }

    @Override
    public void updateRenderState(ShipEntity entity, ShipRenderState state, float tickDelta) {
        super.updateRenderState(entity, state, tickDelta);
        String name = entity.getModelName();
        state.modelName = (name == null || name.isEmpty()) ? DEFAULT_MODEL : name;
        // Read yaw (synced via vanilla entity tracking) — not the custom
        // heading field which only exists server-side.
        state.heading = entity.getYaw();
        state.animationTime = (entity.age + tickDelta) * 0.05f;
    }

    // -- Render -------------------------------------------------------------

    @Override
    public void render(ShipRenderState state, MatrixStack matrices,
                       OrderedRenderCommandQueue queue, CameraRenderState cameraState) {
        super.render(state, matrices, queue, cameraState);

        BBModel model = BBModelLoader.MODELS.get(
                Identifier.of("behavior_statetree", state.modelName));
        if (model == null) {
            if (MISSING_MODELS_LOGGED.add(state.modelName)) {
                org.slf4j.LoggerFactory.getLogger("behavior_statetree").warn(
                        "[Ship Render] Model '{}' not found — known models: {}",
                        state.modelName, BBModelLoader.MODELS.keySet());
            }
            return;
        }

        matrices.push();

        // Scale from Blockbench units to world units
        matrices.scale(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);

        // Ship heading rotation (Y-axis)
        matrices.multiply(new Quaternionf().rotateY(
                (float) Math.toRadians(-state.heading)));

        // Walk the model tree — submit render commands per face
        int light = 0xF000F0; // full bright (airships fly in sky)
        for (BBObject obj : model.root) {
            renderObject(model, obj, matrices, queue, light, state.animationTime);
        }

        matrices.pop();
    }

    // -- Tree traversal -----------------------------------------------------

    private void renderObject(BBModel model, BBObject object, MatrixStack matrices,
                              OrderedRenderCommandQueue queue, int light, float time) {
        matrices.push();

        // Apply object origin
        matrices.translate(object.origin.x(), object.origin.y(), object.origin.z());

        // Apply keyframe animation (propellers spin, sails flap, etc.)
        // Only the first animation is sampled — BBModel files typically
        // use one combined looped animation per model.
        if (!model.animations.isEmpty()) {
            BBAnimation animation = model.animations.get(0);
            if (animation.hasAnimator(object.uuid)) {
                Vector3f position = animation.sample(object.uuid, BBAnimator.Channel.POSITION, time);
                position.mul(1.0f / 16.0f);
                matrices.translate(position.x(), position.y(), position.z());

                Vector3f rotation = animation.sample(object.uuid, BBAnimator.Channel.ROTATION, time);
                rotation.mul((float) (Math.PI / 180.0));
                matrices.multiply(BBModelUtils.fromXYZ(rotation));

                Vector3f scale = animation.sample(object.uuid, BBAnimator.Channel.SCALE, time);
                matrices.scale(scale.x(), scale.y(), scale.z());
            }
        }

        // Apply object rotation
        matrices.multiply(BBModelUtils.fromXYZ(object.rotation));

        if (object instanceof BBBone bone) {
            // Bones pivot around their origin — translate back before recursing
            matrices.translate(-object.origin.x(), -object.origin.y(), -object.origin.z());

            if (bone.visibility) {
                for (BBObject child : bone.children) {
                    renderObject(model, child, matrices, queue, light, time);
                }
            }
        } else if (object instanceof BBFaceContainer container) {
            submitFaces(container, matrices, queue, light);
        }

        matrices.pop();
    }

    // -- Face submission ----------------------------------------------------

    private void submitFaces(BBFaceContainer container, MatrixStack matrices,
                             OrderedRenderCommandQueue queue, int light) {
        for (BBFace face : container.getFaces()) {
            RenderLayer layer = container.enableCulling()
                    ? RenderLayers.entityCutout(face.texture.location)
                    : RenderLayers.entityCutoutNoCull(face.texture.location);

            // submitCustom captures current matrix state in the entry
            queue.submitCustom(matrices, layer, (entry, vc) -> {
                for (int i = 0; i < 4; i++) {
                    BBFace.BBVertex v = face.vertices[i];
                    vc.vertex(entry.getPositionMatrix(), v.x, v.y, v.z)
                            .color(1.0f, 1.0f, 1.0f, 1.0f)
                            .texture(v.u, v.v)
                            .overlay(OverlayTexture.DEFAULT_UV)
                            .light(light)
                            .normal(entry, v.nx, v.ny, v.nz);
                }
            });
        }
    }
}
