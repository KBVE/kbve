package com.kbve.statetree.bbmodel.render;

import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.client.render.OverlayTexture;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.render.VertexConsumer;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.entity.Entity;
import org.joml.Matrix4f;
import org.joml.Vector3f;

import com.kbve.statetree.bbmodel.*;

import java.util.List;

/**
 * Renders BBModel meshes using Minecraft's vertex consumer pipeline.
 *
 * <p>Adapted from ImmersiveAircraft (GPL-3.0).
 * Original: https://github.com/Luke100000/ImmersiveAircraft
 *
 * <p>Remapped from Mojang mappings to Yarn for Fabric 1.21.x.
 */
public class BBModelRenderer {

    /**
     * Functional interface for custom vertex consumer selection per face.
     * Named differently from MC's VertexConsumerProvider to avoid shadowing.
     */
    public interface FaceBufferProvider {
        VertexConsumer getBuffer(VertexConsumerProvider source, BBFaceContainer container, BBFace face);
    }

    public static final FaceBufferProvider DEFAULT_FACE_BUFFER_PROVIDER =
            (source, container, face) -> source.getBuffer(
                    container.enableCulling()
                            ? RenderLayer.getEntityCutout(face.texture.location)
                            : RenderLayer.getEntityCutoutNoCull(face.texture.location));

    public static <T extends Entity> void renderModel(
            BBModel model, MatrixStack matrixStack, VertexConsumerProvider vertexConsumers,
            int light, float time, T entity, ModelPartRenderHandler<T> partRenderer,
            float red, float green, float blue, float alpha) {
        model.root.forEach(object -> renderObject(model, object, matrixStack, vertexConsumers,
                light, time, entity, partRenderer, red, green, blue, alpha));
    }

    public static <T extends Entity> void renderObject(
            BBModel model, BBObject object, MatrixStack matrixStack, VertexConsumerProvider vertexConsumers,
            int light, float time, T entity, ModelPartRenderHandler<T> partRenderer,
            float red, float green, float blue, float alpha) {
        matrixStack.push();
        matrixStack.translate(object.origin.x(), object.origin.y(), object.origin.z());

        // Apply animations
        if (!model.animations.isEmpty()) {
            BBAnimation animation = model.animations.get(0);
            if (animation.hasAnimator(object.uuid)) {
                Vector3f position = animation.sample(object.uuid, BBAnimator.Channel.POSITION, time);
                position.mul(1.0f / 16.0f);
                matrixStack.translate(position.x(), position.y(), position.z());

                Vector3f rotation = animation.sample(object.uuid, BBAnimator.Channel.ROTATION, time);
                rotation.mul(1.0f / 180.0f * (float) Math.PI);
                matrixStack.multiply(BBModelUtils.fromXYZ(rotation));

                Vector3f scale = animation.sample(object.uuid, BBAnimator.Channel.SCALE, time);
                matrixStack.scale(scale.x(), scale.y(), scale.z());
            }
        }

        // Apply object rotation
        matrixStack.multiply(BBModelUtils.fromXYZ(object.rotation));

        // Apply additional animations via callback
        if (object instanceof BBBone bone && partRenderer != null) {
            partRenderer.animate(bone.name, entity, matrixStack, time);
        }

        // Bone origin is only used during transformation
        if (object instanceof BBBone) {
            matrixStack.translate(-object.origin.x(), -object.origin.y(), -object.origin.z());
        }

        // Render the object (callback can override)
        if (partRenderer == null || !partRenderer.render(object.name, model, object,
                vertexConsumers, entity, matrixStack, light, time, partRenderer)) {
            renderObjectInner(model, object, matrixStack, vertexConsumers,
                    light, time, entity, partRenderer, red, green, blue, alpha);
        }

        matrixStack.pop();
    }

    public static <T extends Entity> void renderObjectInner(
            BBModel model, BBObject object, MatrixStack matrixStack, VertexConsumerProvider vertexConsumers,
            int light, float time, T entity, ModelPartRenderHandler<T> partRenderer,
            float red, float green, float blue, float alpha) {
        if (object instanceof BBFaceContainer cube) {
            FaceBufferProvider provider = partRenderer == null
                    ? DEFAULT_FACE_BUFFER_PROVIDER
                    : partRenderer.getFaceBufferProvider();
            renderFaces(cube, matrixStack, vertexConsumers, light, red, green, blue, alpha, provider);
        } else if (object instanceof BBBone bone) {
            if (bone.visibility) {
                bone.children.forEach(child -> renderObject(model, child, matrixStack, vertexConsumers,
                        light, time, entity, partRenderer, red, green, blue, alpha));
            }
        }
    }

    public static void renderFaces(
            BBFaceContainer cube, MatrixStack matrixStack, VertexConsumerProvider source,
            int light, float red, float green, float blue, float alpha,
            FaceBufferProvider provider) {
        MatrixStack.Entry entry = matrixStack.peek();
        Matrix4f positionMatrix = entry.getPositionMatrix();
        for (BBFace face : cube.getFaces()) {
            VertexConsumer vc = provider.getBuffer(source, cube, face);
            for (int i = 0; i < 4; i++) {
                BBFace.BBVertex v = face.vertices[i];
                vc.vertex(positionMatrix, v.x, v.y, v.z)
                        .color(red, green, blue, alpha)
                        .texture(v.u, v.v)
                        .overlay(OverlayTexture.DEFAULT_UV)
                        .light(light)
                        .normal(entry, v.nx, v.ny, v.nz);
            }
        }
    }

    public static void renderSailObject(
            BBMesh cube, MatrixStack matrixStack, VertexConsumerProvider vertexConsumers,
            int light, float time, float red, float green, float blue, float alpha) {
        renderSailObject(cube, matrixStack, vertexConsumers, light, time, red, green, blue, alpha, 0.025f, 0.0f);
    }

    public static void renderSailObject(
            BBMesh cube, MatrixStack matrixStack, VertexConsumerProvider vertexConsumers,
            int light, float time, float red, float green, float blue, float alpha,
            float distanceScale, float baseScale) {
        MatrixStack.Entry entry = matrixStack.peek();
        Matrix4f positionMatrix = entry.getPositionMatrix();
        for (BBFace face : cube.getFaces()) {
            VertexConsumer vc = vertexConsumers.getBuffer(
                    RenderLayer.getEntityCutoutNoCull(face.texture.location));
            for (int i = 0; i < 4; i++) {
                BBFace.BBVertex v = face.vertices[i];
                float distance = Math.max(Math.max(Math.abs(v.x), Math.abs(v.y)), Math.abs(v.z));
                double angle = (v.x + v.z + v.y * 0.25) * 4.0f + time * 4.0f;
                double scale = distanceScale * distance + baseScale;
                float dx = (float) ((Math.cos(angle) + Math.cos(angle * 1.7)) * scale);
                float dz = (float) ((Math.sin(angle) + Math.sin(angle * 1.7)) * scale);

                vc.vertex(positionMatrix, v.x + dx, v.y, v.z + dz)
                        .color(red, green, blue, alpha)
                        .texture(v.u, v.v)
                        .overlay(OverlayTexture.DEFAULT_UV)
                        .light(light)
                        .normal(entry, v.nx, v.ny, v.nz);
            }
        }
    }
}
