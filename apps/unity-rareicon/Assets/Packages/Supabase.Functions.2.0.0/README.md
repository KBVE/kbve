<p align="center">
<img width="300" src=".github/supabase-functions.png"/>
</p>

<p align="center">
  <img src="https://github.com/supabase-community/functions-csharp/workflows/Build%20And%20Test/badge.svg"/>
  <a href="https://www.nuget.org/packages/functions-csharp/">
    <img src="https://img.shields.io/badge/dynamic/json?color=green&label=Nuget%20Release&query=data[0].version&url=https%3A%2F%2Fazuresearch-usnc.nuget.org%2Fquery%3Fq%3Dpackageid%3Afunctions-csharp"/>
  </a>
</p>

---

## [Notice]: v2.0.0 renames this package from `functions-csharp` to `Supabase.Functions`. The depreciation notice has been set in NuGet. The API remains the same.

C# Client library to interact with Supabase Functions.

## Package made possible through the efforts of:

Join the ranks! See a problem? Help fix it!

<a href="https://github.com/supabase-community/functions-csharp/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=supabase-community/functions-csharp" />
</a>

<small>Made with [contrib.rocks](https://contrib.rocks).</small>

## Contributing

We are more than happy to have contributions! Please submit a PR.

### Testing

To run the tests locally you must have docker and docker-compose installed. Then in the root of the repository run:

- `docker-compose up -d`
- `dotnet test`
