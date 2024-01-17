extern crate proc_macro;
use proc_macro::TokenStream;
use quote::quote;
use syn::{
    parse_macro_input, DeriveInput, Data, Fields, Visibility, 
    Field, Attribute, Lit, Meta, NestedMeta
};
use syn::spanned::Spanned;

#[proc_macro_derive(Setters, attributes(holy))]
pub fn setters_derive(input: TokenStream) -> TokenStream {
    let ast = parse_macro_input!(input as DeriveInput);
    impl_setters_macro(&ast).unwrap_or_else(|e| e.to_compile_error().into())
}

fn impl_setters_macro(ast: &DeriveInput) -> Result<TokenStream, syn::Error> {
    let name = &ast.ident;
    let setters = match &ast.data {
        Data::Struct(data) => {
            match &data.fields {
                Fields::Named(fields) => {
                    fields.named.iter().map(|f| {
                        generate_setter(f)
                    }).collect::<Result<Vec<_>, syn::Error>>()?
                },
                _ => return Err(syn::Error::new_spanned(&ast, "Setters macro only supports structs with named fields")),
            }
        },
        _ => return Err(syn::Error::new_spanned(&ast, "Setters macro only supports structs")),
    };

    let expanded = quote! {
        impl #name {
            #(#setters)*
        }
    };

    Ok(TokenStream::from(expanded))
}

fn generate_setter(field: &Field) -> Result<proc_macro2::TokenStream, syn::Error> {
    let field_name = field.ident.as_ref().ok_or_else(|| syn::Error::new_spanned(field, "Field without a name"))?;
    let field_type = &field.ty;
    let vis = &field.vis;
    let setter_name = syn::Ident::new(&format!("set_{}", field_name), field_name.span());
    let setter_vis = determine_visibility(vis, &field.attrs)?;

    let setter = quote! {
        #setter_vis fn #setter_name(&mut self, value: #field_type) {
            self.#field_name = value;
        }
    };

    Ok(setter)
}

fn determine_visibility(vis: &Visibility, attrs: &[Attribute]) -> Result<proc_macro2::TokenStream, syn::Error> {
    if let Some(override_vis) = attrs.iter().find(|attr| attr.path.is_ident("holy")).and_then(parse_visibility_override) {
        Ok(override_vis)
    } else {
        match vis {
            Visibility::Public(_) => Ok(quote! { pub }),
            Visibility::Restricted(restricted) => Ok(quote! { pub(#restricted) }),
            _ => Ok(quote! {}),
        }
    }
}

fn parse_visibility_override(attr: &Attribute) -> Option<proc_macro2::TokenStream> {
    attr.parse_meta().ok().and_then(|meta| {
        if let Meta::List(meta_list) = meta {
            for nested_meta in meta_list.nested.iter() {
                match nested_meta {
                    NestedMeta::Meta(Meta::Path(path)) if path.is_ident("public") => return Some(quote! { pub }),
                    NestedMeta::Meta(Meta::Path(path)) if path.is_ident("private") => return Some(quote! {}),
                    _ => continue,
                }
            }
        }
        None
    })
}