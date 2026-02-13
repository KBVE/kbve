use proc_macro::TokenStream;
use quote::quote;
use syn::{Data, DeriveInput, Field, Fields, Type};

use crate::utils::get_holy_string_value;

enum SanitizeRule {
	Trim,
	Lowercase,
	Uppercase,
	Truncate(usize),
	Alphanumeric,
	EscapeHtml,
	Clamp(String, String),
}

enum FieldTypeKind {
	String,
	Numeric,
	Other,
}

fn classify_type(ty: &Type) -> FieldTypeKind {
	if let Type::Path(type_path) = ty {
		if let Some(segment) = type_path.path.segments.last() {
			let ident = segment.ident.to_string();
			return match ident.as_str() {
				"String" => FieldTypeKind::String,
				"i8" | "i16" | "i32" | "i64" | "u8" | "u16" | "u32" | "u64" | "f32" | "f64"
				| "isize" | "usize" => FieldTypeKind::Numeric,
				_ => FieldTypeKind::Other,
			};
		}
	}
	FieldTypeKind::Other
}

fn split_rules(input: &str) -> Vec<String> {
	let mut result = Vec::new();
	let mut current = String::new();
	let mut depth = 0u32;
	for ch in input.chars() {
		match ch {
			'(' => {
				depth += 1;
				current.push(ch);
			}
			')' => {
				depth = depth.saturating_sub(1);
				current.push(ch);
			}
			',' if depth == 0 => {
				let trimmed = current.trim().to_string();
				if !trimmed.is_empty() {
					result.push(trimmed);
				}
				current.clear();
			}
			_ => {
				current.push(ch);
			}
		}
	}
	let trimmed = current.trim().to_string();
	if !trimmed.is_empty() {
		result.push(trimmed);
	}
	result
}

fn parse_sanitize_rules(
	raw: &str,
	span: proc_macro2::Span,
) -> Result<Vec<SanitizeRule>, syn::Error> {
	let tokens = split_rules(raw);
	let mut rules = Vec::new();

	for token in &tokens {
		let rule = if token == "trim" {
			SanitizeRule::Trim
		} else if token == "lowercase" {
			SanitizeRule::Lowercase
		} else if token == "uppercase" {
			SanitizeRule::Uppercase
		} else if token == "alphanumeric" {
			SanitizeRule::Alphanumeric
		} else if token == "escape_html" {
			SanitizeRule::EscapeHtml
		} else if let Some(inner) = token.strip_prefix("truncate(").and_then(|s| s.strip_suffix(')'))
		{
			let n: usize = inner.trim().parse().map_err(|_| {
				syn::Error::new(span, format!("invalid truncate length: '{}'", inner.trim()))
			})?;
			SanitizeRule::Truncate(n)
		} else if let Some(inner) = token.strip_prefix("clamp(").and_then(|s| s.strip_suffix(')')) {
			let parts: Vec<&str> = inner.splitn(2, ',').collect();
			if parts.len() != 2 {
				return Err(syn::Error::new(
					span,
					format!("clamp requires two arguments: clamp(min,max), got '{}'", token),
				));
			}
			SanitizeRule::Clamp(parts[0].trim().to_string(), parts[1].trim().to_string())
		} else {
			return Err(syn::Error::new(
				span,
				format!("unknown sanitize rule: '{}'", token),
			));
		};
		rules.push(rule);
	}

	Ok(rules)
}

fn validate_rule_for_type(
	rule: &SanitizeRule,
	type_kind: &FieldTypeKind,
	field_name: &syn::Ident,
	span: proc_macro2::Span,
) -> Result<(), syn::Error> {
	match rule {
		SanitizeRule::Trim
		| SanitizeRule::Lowercase
		| SanitizeRule::Uppercase
		| SanitizeRule::Truncate(_)
		| SanitizeRule::Alphanumeric
		| SanitizeRule::EscapeHtml => {
			if !matches!(type_kind, FieldTypeKind::String) {
				let rule_name = match rule {
					SanitizeRule::Trim => "trim",
					SanitizeRule::Lowercase => "lowercase",
					SanitizeRule::Uppercase => "uppercase",
					SanitizeRule::Truncate(_) => "truncate",
					SanitizeRule::Alphanumeric => "alphanumeric",
					SanitizeRule::EscapeHtml => "escape_html",
					_ => unreachable!(),
				};
				return Err(syn::Error::new(
					span,
					format!(
						"sanitize rule '{}' is only valid for String fields, but field '{}' has a numeric type",
						rule_name, field_name
					),
				));
			}
		}
		SanitizeRule::Clamp(_, _) => {
			if !matches!(type_kind, FieldTypeKind::Numeric) {
				return Err(syn::Error::new(
					span,
					format!(
						"sanitize rule 'clamp' is only valid for numeric fields, but field '{}' has type String",
						field_name
					),
				));
			}
		}
	}
	Ok(())
}

fn rule_to_tokens(field_name: &syn::Ident, rule: &SanitizeRule) -> proc_macro2::TokenStream {
	match rule {
		SanitizeRule::Trim => quote! {
			self.#field_name = self.#field_name.trim().to_string();
		},
		SanitizeRule::Lowercase => quote! {
			self.#field_name = self.#field_name.to_lowercase();
		},
		SanitizeRule::Uppercase => quote! {
			self.#field_name = self.#field_name.to_uppercase();
		},
		SanitizeRule::Truncate(n) => quote! {
			self.#field_name.truncate(#n);
		},
		SanitizeRule::Alphanumeric => quote! {
			self.#field_name = self.#field_name.chars().filter(|c| c.is_alphanumeric()).collect();
		},
		SanitizeRule::EscapeHtml => quote! {
			self.#field_name = self.#field_name
				.replace('&', "&amp;")
				.replace('<', "&lt;")
				.replace('>', "&gt;")
				.replace('"', "&quot;")
				.replace('\'', "&#x27;");
		},
		SanitizeRule::Clamp(min, max) => {
			let min_lit: proc_macro2::TokenStream = min.parse().unwrap();
			let max_lit: proc_macro2::TokenStream = max.parse().unwrap();
			quote! {
				self.#field_name = self.#field_name.clamp(#min_lit, #max_lit);
			}
		}
	}
}

fn process_field(field: &Field) -> Result<Option<(syn::Ident, Vec<proc_macro2::TokenStream>)>, syn::Error> {
	let Some((raw_rules, span)) = get_holy_string_value(&field.attrs, "sanitize") else {
		return Ok(None);
	};

	let field_name = field.ident.as_ref().unwrap().clone();
	let type_kind = classify_type(&field.ty);
	let rules = parse_sanitize_rules(&raw_rules, span)?;

	for rule in &rules {
		validate_rule_for_type(rule, &type_kind, &field_name, span)?;
	}

	let rule_tokens: Vec<_> = rules.iter().map(|r| rule_to_tokens(&field_name, r)).collect();

	Ok(Some((field_name, rule_tokens)))
}

pub fn impl_sanitize_macro(ast: &DeriveInput) -> Result<TokenStream, syn::Error> {
	let struct_name = &ast.ident;
	let (impl_generics, ty_generics, where_clause) = ast.generics.split_for_impl();

	let fields = match &ast.data {
		Data::Struct(data) => match &data.fields {
			Fields::Named(named) => &named.named,
			_ => {
				return Err(syn::Error::new_spanned(
					ast,
					"Sanitize macro only supports structs with named fields",
				));
			}
		},
		_ => {
			return Err(syn::Error::new_spanned(
				ast,
				"Sanitize macro only supports structs",
			));
		}
	};

	let mut per_field_methods = Vec::new();
	let mut all_field_calls = Vec::new();

	for field in fields.iter() {
		let Some((field_name, rule_tokens)) = process_field(field)? else {
			continue;
		};

		let sanitize_method_name =
			syn::Ident::new(&format!("sanitize_{}", field_name), field_name.span());

		per_field_methods.push(quote! {
			pub fn #sanitize_method_name(&mut self) {
				#(#rule_tokens)*
			}
		});

		all_field_calls.push(quote! {
			self.#sanitize_method_name();
		});
	}

	if per_field_methods.is_empty() {
		return Ok(TokenStream::from(quote! {}));
	}

	let expanded = quote! {
		impl #impl_generics #struct_name #ty_generics #where_clause {
			pub fn sanitize(&mut self) {
				#(#all_field_calls)*
			}

			#(#per_field_methods)*
		}
	};

	Ok(TokenStream::from(expanded))
}
