package com.kbve.statetree.bbmodel.render;

import com.mojang.blaze3d.vertex.PoseStack;
import com.kbve.statetree.bbmodel.BBModel;
import com.kbve.statetree.bbmodel.BBObject;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.world.entity.Entity;

public record ModelPartRenderer<T extends Entity>(
        String id,
        ModelPartRenderer.AnimationConsumer<T> animationConsumer,
        ModelPartRenderer.RenderConsumer<T> renderConsumer
) {
    public interface AnimationConsumer<T> {
        void run(T entity, float yaw, float time, PoseStack matrixStack);
    }

    public interface RenderConsumer<T extends Entity> {
        void run(BBModel model, BBObject object, MultiBufferSource vertexConsumerProvider, T entity, PoseStack matrixStack, int light, float time, ModelPartRenderHandler<T> modelPartRenderer);
    }
}
