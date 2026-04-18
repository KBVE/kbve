package com.kbve.statetree.bbmodel.render;

import net.minecraft.client.util.math.MatrixStack;
import com.kbve.statetree.bbmodel.BBModel;
import com.kbve.statetree.bbmodel.BBObject;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.entity.Entity;

import java.util.HashMap;
import java.util.Map;

/**
 * Provides a way to provide overrides for rendering and animating model parts.
 */
public class ModelPartRenderHandler<T extends Entity> {
    private final Map<String, ModelPartRenderer<T>> objects = new HashMap<>();
    private BBModelRenderer.VertexConsumerProvider vertexConsumerProvider = BBModelRenderer.DEFAULT_VERTEX_CONSUMER_PROVIDER;

    public ModelPartRenderHandler<T> add(String id, ModelPartRenderer.AnimationConsumer<T> animationConsumer) {
        return add(id, animationConsumer, null);
    }

    public ModelPartRenderHandler<T> add(String id, ModelPartRenderer.RenderConsumer<T> renderConsumer) {
        return add(id, null, renderConsumer);
    }

    public ModelPartRenderHandler<T> add(String id, ModelPartRenderer.AnimationConsumer<T> animationConsumer, ModelPartRenderer.RenderConsumer<T> renderConsumer) {
        ModelPartRenderer<T> o = new ModelPartRenderer<>(id, animationConsumer, renderConsumer);
        objects.put(o.id(), o);
        return this;
    }

    public Map<String, ModelPartRenderer<T>> getObjects() {
        return objects;
    }

    public void animate(String name, T entity, MatrixStack matrixStack, float time) {
        ModelPartRenderer<T> o = objects.get(name);
        if (o != null && o.animationConsumer() != null) {
            o.animationConsumer().run(entity, 0, time, matrixStack);
        }
    }

    public boolean render(String name, BBModel model, BBObject object, VertexConsumerProvider vertexConsumerProvider, T entity, MatrixStack matrixStack, int light, float time, ModelPartRenderHandler<T> modelPartRenderer) {
        ModelPartRenderer<T> o = objects.get(name);
        if (o != null && o.renderConsumer() != null) {
            o.renderConsumer().run(model, object, vertexConsumerProvider, entity, matrixStack, light, time, modelPartRenderer);
            return true;
        }
        return false;
    }

    /**
     * Set the vertex consumer provider for this model part renderer, allowing for custom render types.
     * @param vertexConsumerProvider The mapping between renderable and vertex consumers.
     */
    public ModelPartRenderHandler<T> vertexConsumerProvider(BBModelRenderer.VertexConsumerProvider vertexConsumerProvider) {
        this.vertexConsumerProvider = vertexConsumerProvider;
        return this;
    }

    public BBModelRenderer.VertexConsumerProvider getVertexConsumerProvider() {
        return vertexConsumerProvider;
    }
}
