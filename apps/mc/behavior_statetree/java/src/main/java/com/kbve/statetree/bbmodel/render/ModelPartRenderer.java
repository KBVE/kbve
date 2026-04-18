package com.kbve.statetree.bbmodel.render;

import net.minecraft.client.util.math.MatrixStack;
import com.kbve.statetree.bbmodel.BBModel;
import com.kbve.statetree.bbmodel.BBObject;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.entity.Entity;

public record ModelPartRenderer<T extends Entity>(
        String id,
        ModelPartRenderer.AnimationConsumer<T> animationConsumer,
        ModelPartRenderer.RenderConsumer<T> renderConsumer
) {
    public interface AnimationConsumer<T> {
        void run(T entity, float yaw, float time, MatrixStack matrixStack);
    }

    public interface RenderConsumer<T extends Entity> {
        void run(BBModel model, BBObject object, VertexConsumerProvider vertexConsumerProvider, T entity, MatrixStack matrixStack, int light, float time, ModelPartRenderHandler<T> modelPartRenderer);
    }
}
