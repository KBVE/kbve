// Auto-generated protobuf modules via prost-build
// Source: packages/data/proto/kbve/*.proto

#[allow(dead_code, clippy::enum_variant_names)]
pub mod kbve {
    #[allow(dead_code)]
    pub mod common {
        include!(concat!(env!("OUT_DIR"), "/kbve.common.rs"));
    }

    #[allow(dead_code, clippy::enum_variant_names)]
    pub mod enums {
        include!(concat!(env!("OUT_DIR"), "/kbve.enums.rs"));
    }

    #[allow(dead_code)]
    pub mod snapshot {
        include!(concat!(env!("OUT_DIR"), "/kbve.snapshot.rs"));
    }

    #[allow(dead_code)]
    pub mod pool {
        include!(concat!(env!("OUT_DIR"), "/kbve.pool.rs"));
    }

    #[allow(dead_code, clippy::enum_variant_names)]
    pub mod schema {
        include!(concat!(env!("OUT_DIR"), "/kbve.schema.rs"));
    }

    #[allow(dead_code)]
    pub mod osrs {
        include!(concat!(env!("OUT_DIR"), "/kbve.osrs.rs"));
    }
}
