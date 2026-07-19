use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, Data, DeriveInput, Fields};

#[proc_macro_derive(FromEmbedRow)]
pub fn derive_from_embed_row(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as DeriveInput);
    let name = &input.ident;

    let fields = match &input.data {
        Data::Struct(s) => match &s.fields {
            Fields::Named(named) => &named.named,
            _ => {
                return syn::Error::new_spanned(name, "FromEmbedRow requires named fields")
                    .to_compile_error()
                    .into();
            }
        },
        _ => {
            return syn::Error::new_spanned(name, "FromEmbedRow can only be derived for structs")
                .to_compile_error()
                .into();
        }
    };

    let inits = fields.iter().map(|field| {
        let ident = field.ident.as_ref().unwrap();
        let col = ident.to_string();
        let ty = &field.ty;
        quote! {
            #ident: {
                let __idx = __columns.iter().position(|c| c == #col);
                let __v = __idx.and_then(|i| __row.get(i));
                <#ty as ::embeddb::FromEmbedValue>::from_embed_value(__v)
                    .map_err(|e| ::embeddb::EmbedError::Other(
                        format!("column '{}': {}", #col, e)))?
            }
        }
    });

    let expanded = quote! {
        impl ::embeddb::FromEmbedRow for #name {
            fn from_row(__row: &::embeddb::EmbedRow, __columns: &[String]) -> ::embeddb::Result<Self> {
                Ok(#name {
                    #(#inits),*
                })
            }
        }
    };
    expanded.into()
}
