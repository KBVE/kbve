use proc_macro::TokenStream;
use quote::quote;
use syn::{Data, DeriveInput, Field, Fields, GenericArgument, PathArguments, Type};

use crate::utils::{determine_visibility, get_holy_string_value};

enum SanitizeRule {
    Trim,
    Lowercase,
    Uppercase,
    Truncate(usize),
    Alphanumeric,
    EscapeHtml,
    NulStrip,
    ControlStrip,
    Slug,
    Clamp(proc_macro2::TokenStream, proc_macro2::TokenStream),
}

enum FieldTypeKind {
    String,
    OptionString,
    Numeric,
    Other,
}

fn is_string_type(ty: &Type) -> bool {
    if let Type::Path(type_path) = ty
        && let Some(segment) = type_path.path.segments.last()
    {
        return segment.ident == "String";
    }
    false
}

fn classify_type(ty: &Type) -> FieldTypeKind {
    if let Type::Path(type_path) = ty
        && let Some(segment) = type_path.path.segments.last()
    {
        let ident = segment.ident.to_string();
        if ident == "Option" {
            if let PathArguments::AngleBracketed(args) = &segment.arguments
                && let Some(GenericArgument::Type(inner)) = args.args.first()
                && is_string_type(inner)
            {
                return FieldTypeKind::OptionString;
            }
            return FieldTypeKind::Other;
        }
        return match ident.as_str() {
            "String" => FieldTypeKind::String,
            "i8" | "i16" | "i32" | "i64" | "u8" | "u16" | "u32" | "u64" | "f32" | "f64"
            | "isize" | "usize" => FieldTypeKind::Numeric,
            _ => FieldTypeKind::Other,
        };
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

/// Rule names `#[holy(validate = "...")]` accepts.
///
/// Checked here so a typo is a compile error pointing at the attribute rather
/// than a panic from the runtime when that field is first sanitised. The
/// runtime has the matching arm for each of these.
const VALIDATE_RULES: &[&str] = &[
    "captcha_token",
    "discord_server",
    "email",
    "github_url",
    "hex_code",
    "no_html",
    "non_empty",
    "service",
    "ulid",
    "url",
    "username",
];

fn parse_validate_rules(raw: &str, span: proc_macro2::Span) -> Result<Vec<String>, syn::Error> {
    let mut rules = Vec::new();
    for token in split_rules(raw) {
        if !VALIDATE_RULES.contains(&token.as_str()) {
            return Err(syn::Error::new(
                span,
                format!(
                    "unknown validate rule: '{}'. Known rules: {}",
                    token,
                    VALIDATE_RULES.join(", ")
                ),
            ));
        }
        rules.push(token);
    }
    Ok(rules)
}

/// The `validate_<field>` helper for one field, if it has any validate rules.
///
/// Only String and Option<String> can be validated: every rule is a pattern
/// match over text, and there is no sensible meaning for one over a number.
/// A None field is skipped rather than rejected -- absent is not the same as
/// malformed, and `non_empty` on an Option would otherwise mean "required",
/// which is a different decision than this attribute is making.
fn process_validators(
    field: &Field,
) -> Result<Option<(syn::Ident, proc_macro2::TokenStream)>, syn::Error> {
    let Some((raw_rules, span)) = get_holy_string_value(&field.attrs, "validate") else {
        return Ok(None);
    };

    let field_name = field.ident.as_ref().unwrap().clone();
    let type_kind = classify_type(&field.ty);
    let rules = parse_validate_rules(&raw_rules, span)?;

    if rules.is_empty() {
        return Ok(None);
    }

    if !matches!(
        type_kind,
        FieldTypeKind::String | FieldTypeKind::OptionString
    ) {
        return Err(syn::Error::new(
            span,
            format!(
                "validate rules are only valid for String fields, but field '{}' has another type",
                field_name
            ),
        ));
    }

    let field_label = field_name.to_string();
    let checks = rules.iter().map(|rule| {
        quote! {
            if let Some(__error) = ::holy::validate::check(#rule, #field_label, __value) {
                __errors.push(__error);
            }
        }
    });

    let body = match type_kind {
        FieldTypeKind::OptionString => quote! {
            if let Some(__value) = self.#field_name.as_deref() {
                #(#checks)*
            }
        },
        _ => quote! {
            {
                let __value: &str = self.#field_name.as_str();
                #(#checks)*
            }
        },
    };

    Ok(Some((field_name, body)))
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
        } else if token == "nul_strip" {
            SanitizeRule::NulStrip
        } else if token == "control_strip" {
            SanitizeRule::ControlStrip
        } else if token == "slug" {
            SanitizeRule::Slug
        } else if let Some(inner) = token
            .strip_prefix("truncate(")
            .and_then(|s| s.strip_suffix(')'))
        {
            let n: usize = inner.trim().parse().map_err(|_| {
                syn::Error::new(span, format!("invalid truncate length: '{}'", inner.trim()))
            })?;
            SanitizeRule::Truncate(n)
        } else if let Some(inner) = token
            .strip_prefix("clamp(")
            .and_then(|s| s.strip_suffix(')'))
        {
            let parts: Vec<&str> = inner.splitn(2, ',').collect();
            if parts.len() != 2 {
                return Err(syn::Error::new(
                    span,
                    format!(
                        "clamp requires two arguments: clamp(min,max), got '{}'",
                        token
                    ),
                ));
            }
            let min_raw = parts[0].trim();
            let max_raw = parts[1].trim();
            let min_ts: proc_macro2::TokenStream = min_raw.parse().map_err(|_| {
                syn::Error::new(span, format!("invalid clamp min argument: '{}'", min_raw))
            })?;
            let max_ts: proc_macro2::TokenStream = max_raw.parse().map_err(|_| {
                syn::Error::new(span, format!("invalid clamp max argument: '{}'", max_raw))
            })?;
            SanitizeRule::Clamp(min_ts, max_ts)
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
        | SanitizeRule::EscapeHtml
        | SanitizeRule::NulStrip
        | SanitizeRule::ControlStrip
        | SanitizeRule::Slug => {
            if !matches!(
                type_kind,
                FieldTypeKind::String | FieldTypeKind::OptionString
            ) {
                let rule_name = match rule {
                    SanitizeRule::Trim => "trim",
                    SanitizeRule::Lowercase => "lowercase",
                    SanitizeRule::Uppercase => "uppercase",
                    SanitizeRule::Truncate(_) => "truncate",
                    SanitizeRule::Alphanumeric => "alphanumeric",
                    SanitizeRule::EscapeHtml => "escape_html",
                    SanitizeRule::NulStrip => "nul_strip",
                    SanitizeRule::ControlStrip => "control_strip",
                    SanitizeRule::Slug => "slug",
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

fn rule_to_tokens(
    access: &proc_macro2::TokenStream,
    rule: &SanitizeRule,
) -> proc_macro2::TokenStream {
    match rule {
        SanitizeRule::Trim => quote! {
            #access = #access.trim().to_string();
        },
        SanitizeRule::Lowercase => quote! {
            #access = #access.to_lowercase();
        },
        SanitizeRule::Uppercase => quote! {
            #access = #access.to_uppercase();
        },
        // UTF-8-safe byte truncate: walk back to nearest char boundary
        // <= n so multi-byte codepoints (emoji, CJK) never panic
        // String::truncate.
        SanitizeRule::Truncate(n) => quote! {
            if #access.len() > #n {
                let mut __end = #n;
                while __end > 0 && !#access.is_char_boundary(__end) {
                    __end -= 1;
                }
                #access.truncate(__end);
            }
        },
        SanitizeRule::Alphanumeric => quote! {
            #access = #access.chars().filter(|c| c.is_alphanumeric()).collect();
        },
        SanitizeRule::EscapeHtml => quote! {
            #access = #access
                .replace('&', "&amp;")
                .replace('<', "&lt;")
                .replace('>', "&gt;")
                .replace('"', "&quot;")
                .replace('\'', "&#x27;");
        },
        // Drops every NUL byte. Cheap defense-in-depth before storage —
        // some downstream tools (printf, certain DB clients) choke on
        // embedded NULs.
        SanitizeRule::NulStrip => quote! {
            if #access.contains('\0') {
                #access = #access.replace('\0', "");
            }
        },
        // Strips ASCII/Unicode control characters (Cc category) plus the
        // bidi override block (U+202A..U+202E, U+2066..U+2069) and the
        // common zero-width / invisible chars (U+200B..U+200D, U+FEFF).
        // Paired with `escape_html` and `truncate(N)` to clean inline
        // text fields like titles and signatures. Caller should NOT use
        // this on markdown bodies — it removes \n / \t too.
        SanitizeRule::ControlStrip => quote! {
            #access = #access
                .chars()
                .filter(|c| {
                    let cp = *c as u32;
                    !c.is_control()
                        && !(0x202A..=0x202E).contains(&cp)
                        && !(0x2066..=0x2069).contains(&cp)
                        && !matches!(*c, '\u{200B}'..='\u{200D}' | '\u{FEFF}')
                })
                .collect();
        },
        // Lowercase + ASCII alphanumerics + collapse separator runs into
        // single `-`, then trim leading/trailing `-`. Output matches
        // `^[a-z0-9](-?[a-z0-9])*$` after a non-empty input. Empty input
        // stays empty.
        SanitizeRule::Slug => quote! {
            #access = {
                let lower = #access.to_lowercase();
                let mut out = String::with_capacity(lower.len());
                let mut last_dash = false;
                for ch in lower.chars() {
                    if ch.is_ascii_alphanumeric() {
                        out.push(ch);
                        last_dash = false;
                    } else if !last_dash {
                        out.push('-');
                        last_dash = true;
                    }
                }
                out.trim_matches('-').to_string()
            };
        },
        SanitizeRule::Clamp(min, max) => quote! {
            #access = #access.clamp(#min, #max);
        },
    }
}

fn process_field(
    field: &Field,
) -> Result<Option<(syn::Ident, proc_macro2::TokenStream)>, syn::Error> {
    let Some((raw_rules, span)) = get_holy_string_value(&field.attrs, "sanitize") else {
        return Ok(None);
    };

    let field_name = field.ident.as_ref().unwrap().clone();
    let type_kind = classify_type(&field.ty);
    let rules = parse_sanitize_rules(&raw_rules, span)?;

    for rule in &rules {
        validate_rule_for_type(rule, &type_kind, &field_name, span)?;
    }

    // For Option<String> we want every rule to operate inside an
    // `if let Some(__s)` so callers don't have to unwrap manually. The
    // `__s` binding is `&mut String`, so `*__s` is a place expression
    // that the rule codegen can both read from and assign to.
    let body = match type_kind {
        FieldTypeKind::OptionString => {
            let access = quote! { (*__s) };
            let rule_tokens = rules.iter().map(|r| rule_to_tokens(&access, r));
            quote! {
                if let Some(__s) = self.#field_name.as_mut() {
                    #(#rule_tokens)*
                }
            }
        }
        _ => {
            let access = quote! { self.#field_name };
            let rule_tokens = rules.iter().map(|r| rule_to_tokens(&access, r));
            quote! { #(#rule_tokens)* }
        }
    };

    Ok(Some((field_name, body)))
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
    let mut validator_methods = Vec::new();
    let mut validator_calls = Vec::new();

    for field in fields.iter() {
        if let Some((field_name, body)) = process_validators(field)? {
            let method_name =
                syn::Ident::new(&format!("validate_{}", field_name), field_name.span());
            let method_vis = determine_visibility(&field.vis, &field.attrs)?;

            validator_methods.push(quote! {
                #method_vis fn #method_name(
                    &self,
                    __errors: &mut ::std::vec::Vec<::holy::FieldError>,
                ) {
                    #body
                }
            });
            validator_calls.push(quote! {
                self.#method_name(&mut __errors);
            });
        }

        let Some((field_name, body)) = process_field(field)? else {
            continue;
        };

        let sanitize_method_name =
            syn::Ident::new(&format!("sanitize_{}", field_name), field_name.span());

        // Per-field helper inherits the field's own visibility (or
        // its #[holy(public|private)] override) so private fields
        // don't leak helpers. The aggregate `sanitize()` method
        // below stays `pub` so callers can always invoke it.
        let method_vis = determine_visibility(&field.vis, &field.attrs)?;

        per_field_methods.push(quote! {
            #method_vis fn #sanitize_method_name(&mut self) {
                #body
            }
        });

        all_field_calls.push(quote! {
            self.#sanitize_method_name();
        });
    }

    if per_field_methods.is_empty() && validator_methods.is_empty() {
        return Ok(TokenStream::from(quote! {}));
    }

    // Cleaning runs before checking, always. A rule set like
    // `sanitize = "trim", validate = "non_empty"` is only meaningful in that
    // order: a field of spaces has to be trimmed before it can be recognised
    // as empty.
    //
    // Every field is checked before returning rather than stopping at the
    // first failure, so a caller gets the whole list at once.
    //
    // The signature is a Result even for a struct that has no validate rules
    // yet. That way adding one later is a change to the struct and not to
    // every call site that sanitises it.
    let expanded = quote! {
        impl #impl_generics #struct_name #ty_generics #where_clause {
            pub fn sanitize(
                &mut self,
            ) -> ::core::result::Result<(), ::std::vec::Vec<::holy::FieldError>> {
                #(#all_field_calls)*

                #[allow(unused_mut)]
                let mut __errors = ::std::vec::Vec::new();
                #(#validator_calls)*

                if __errors.is_empty() {
                    ::core::result::Result::Ok(())
                } else {
                    ::core::result::Result::Err(__errors)
                }
            }

            #(#per_field_methods)*
            #(#validator_methods)*
        }
    };

    Ok(TokenStream::from(expanded))
}
