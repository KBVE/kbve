# GenericProtoPlan.md - DOTS/Common Infrastructure

## **Overview: Generic Protobuf-Powered Entity System**

Create reusable, type-safe infrastructure in `DOTS/Common/` that eliminates code duplication across all entity types (Structure, Item, Resource, Player, etc.) using protobuf-net as the single source of truth.

## **File Structure:**
```
DOTS/
├── Common/
│   ├── GenericProtoPlan.md       # This documentation
│   ├── IEntityData.cs            # Base interface for all entity data
│   ├── ComponentWrapper.cs       # Generic ECS component wrapper
│   ├── GenericBlit.cs           # Generic serialization operations
│   └── EntityDataExtensions.cs  # Common utility methods
├── Components/
│   ├── Structures/StructureComponent.cs  # Implements generic pattern
│   ├── Items/ItemComponent.cs            # Implements generic pattern
│   ├── Resources/ResourceComponent.cs    # Implements generic pattern
│   └── Player/PlayerComponent.cs         # Implements generic pattern
```

## **Implementation Phases:**

### **Phase 1: Create Generic Infrastructure (DOTS/Common)**
1. **IEntityData<T> interface** - Base contract for all entity data types
2. **ComponentWrapper<T>** - Generic ECS IComponentData wrapper with implicit conversions
3. **GenericBlit<T>** - Type-safe protobuf-net serialization operations
4. **EntityDataExtensions** - Common utility methods (equality, hashing, etc.)

### **Phase 2: Convert Structure as Proof of Concept**
1. **Consolidate StructureBlit.cs into StructureComponent.cs**
2. **Add [ProtoContract] attributes** to unified StructureData
3. **Implement IEntityData<StructureData>** interface
4. **Use ComponentWrapper<StructureData>** for ECS integration
5. **Update EntityToVmDrainSystem** to use new structure
6. **Delete redundant StructureBlit.cs**

### **Phase 3: Extend Pattern to Other Entity Types**
1. **ItemComponent.cs** - Apply generic pattern with ItemData
2. **ResourceComponent.cs** - Apply generic pattern with ResourceData
3. **PlayerComponent.cs** - Apply generic pattern with PlayerData
4. **EntityComponent.cs** - Apply generic pattern with EntityData

### **Phase 4: System Integration**
1. **Update all Bridge systems** to use generic serialization
2. **Standardize network protocols** using protobuf-net
3. **Add versioning and schema evolution** support
4. **Performance testing and optimization**

## **Key Benefits:**
- **Single source of truth** via protobuf-net attributes
- **Zero code duplication** across entity types
- **Type-safe generic operations** with compile-time checking
- **Automatic network serialization** without manual coding
- **Schema evolution** support for future changes
- **Consistent patterns** across entire DOTS system
- **High performance** with Unity DOTS optimization
- **Extensible architecture** for new entity types

## **Pattern Usage Example:**
```csharp
// Define data with protobuf-net
[ProtoContract]
public struct StructureData : IEntityData<StructureData>
{
    [ProtoMember(1)] public FixedBytes16 TemplateUlid;
    [ProtoMember(2)] public StructureType Type;
    // ... other fields
}

// ECS component wrapper
public struct Structure : IComponentData
{
    public StructureData Data;
}

// Serialization
byte[] bytes = GenericBlit<StructureData>.Serialize(data);
StructureData data = GenericBlit<StructureData>.Deserialize(bytes);
```

## **Files to Modify:**
- **Create**: DOTS/Common/* (new generic infrastructure)
- **Consolidate**: StructureComponent.cs (merge StructureBlit)
- **Delete**: StructureBlit.cs (redundant)
- **Update**: EntityToVmDrainSystem.cs (use new types)
- **Extend**: All other Blit components (future phases)

## **protobuf-net Integration:**
This project uses protobuf-net 3.2.56 which provides:
- **Attribute-based definitions** - No .proto files needed
- **Unity-optimized performance** - Native .NET integration
- **Compile-time safety** - Full IntelliSense support
- **Schema evolution** - Field versioning and compatibility
- **Binary serialization** - Compact, high-performance wire format

## **Implementation Notes:**
- Use `[ProtoContract]` on all data structs
- Use `[ProtoMember(n)]` with sequential numbering for fields
- Maintain field number consistency for schema evolution
- Prefer PascalCase naming for C# conventions
- Keep data structs blittable where possible for DOTS performance
- Use `IEquatable<T>` for efficient equality comparisons

This architecture provides a **robust, scalable, protobuf-powered foundation** for the entire DOTS entity system.