using Unity.Entities;
using KBVE.MMExtensions.Orchestrator.DOTS;

// Register the SpatialQueryResult buffer element for DOTS compilation
[assembly: RegisterGenericComponentType(typeof(SpatialQueryResult))]