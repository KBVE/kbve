// lib.rs

extern crate proc_macro;
use proc_macro::TokenStream;
use quote::quote;
use syn::{
	parse_macro_input,
	parse_quote,
	DeriveInput,
	Data,
	Fields,
	Visibility,
	Field,
	Attribute,
	Lit,
	Meta,
	NestedMeta,
	Ident,
};

mod getter;
mod setter;
mod observer;
mod utils;

#[proc_macro_derive(Getters, attributes(holy))]
pub fn getters_derive(input: TokenStream) -> TokenStream {
	let ast = parse_macro_input!(input as DeriveInput);
	getter::impl_getters_macro(&ast).unwrap_or_else(|e| e.to_compile_error().into())
}


#[proc_macro_derive(Observer, attributes(holy))]
pub fn observer_derive(input: TokenStream) -> TokenStream {
    let ast = parse_macro_input!(input as DeriveInput);
	observer::impl_observer_macro(&ast).unwrap_or_else(|e| e.to_compile_error().into())

}



#[proc_macro_derive(Setters, attributes(holy))]
pub fn setters_derive(input: TokenStream) -> TokenStream {
	let ast = parse_macro_input!(input as DeriveInput);
	setter::impl_setters_macro(&ast).unwrap_or_else(|e| e.to_compile_error().into())
}

