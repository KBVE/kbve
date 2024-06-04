<script lang="ts">
  import { resume } from './ResumeStore';
  import {
    updateBasics,
    addProfile,
    updateProfile,
    removeProfile,
    addWorkExperience,
    updateWorkExperience,
    removeWorkExperience,
    addVolunteerExperience,
    updateVolunteerExperience,
    removeVolunteerExperience,
    addEducation,
    updateEducation,
    removeEducation,
    addAward,
    updateAward,
    removeAward,
    addCertificate,
    updateCertificate,
    removeCertificate,
    addPublication,
    updatePublication,
    removePublication,
    addSkill,
    updateSkill,
    removeSkill,
    addLanguage,
    updateLanguage,
    removeLanguage,
    addInterest,
    updateInterest,
    removeInterest,
    addReference,
    updateReference,
    removeReference,
    addProject,
    updateProject,
    removeProject,
  } from './ResumeStore';

  interface WorkExperience {
    name: string;
    position: string;
    url: string;
    startDate: string;
    endDate: string;
    summary: string;
    highlights: string[];
  }

  let newProfile = { network: '', username: '', url: '' };
  let newWork: WorkExperience = {
    name: '',
    position: '',
    url: '',
    startDate: '',
    endDate: '',
    summary: '',
    highlights: [],
  };
  let newVolunteer = {
    organization: '',
    position: '',
    url: '',
    startDate: '',
    endDate: '',
    summary: '',
    highlights: [],
  };
  let newEducation = {
    institution: '',
    url: '',
    area: '',
    studyType: '',
    startDate: '',
    endDate: '',
    score: '',
    courses: [],
  };
  let newAward = { title: '', date: '', awarder: '', summary: '' };
  let newCertificate = { name: '', date: '', issuer: '', url: '' };
  let newPublication = {
    name: '',
    publisher: '',
    releaseDate: '',
    url: '',
    summary: '',
  };
  let newSkill = { name: '', level: '', keywords: [] };
  let newLanguage = { language: '', fluency: '' };
  let newInterest = { name: '', keywords: [] };
  let newReference = { name: '', reference: '' };
  let newProject = {
    name: '',
    startDate: '',
    endDate: '',
    description: '',
    highlights: [],
    url: '',
  };

  let newHighlights = '';

  const handleAddProfile = () => {
    addProfile(newProfile);
    newProfile = { network: '', username: '', url: '' };
  };

  const handleRemoveProfile = (index: number) => {
    removeProfile(index);
  };

  const handleAddWork = () => {
    addWorkExperience(newWork);
    newWork = {
      name: '',
      position: '',
      url: '',
      startDate: '',
      endDate: '',
      summary: '',
      highlights: [],
    };
    newHighlights = '';
  };

  const handleRemoveWork = (index: number) => {
    removeWorkExperience(index);
  };

  const handleAddVolunteer = () => {
    addVolunteerExperience(newVolunteer);
    newVolunteer = {
      organization: '',
      position: '',
      url: '',
      startDate: '',
      endDate: '',
      summary: '',
      highlights: [],
    };
  };

  const handleRemoveVolunteer = (index: number) => {
    removeVolunteerExperience(index);
  };

  const handleAddEducation = () => {
    addEducation(newEducation);
    newEducation = {
      institution: '',
      url: '',
      area: '',
      studyType: '',
      startDate: '',
      endDate: '',
      score: '',
      courses: [],
    };
  };

  const handleRemoveEducation = (index: number) => {
    removeEducation(index);
  };

  const handleAddAward = () => {
    addAward(newAward);
    newAward = { title: '', date: '', awarder: '', summary: '' };
  };

  const handleRemoveAward = (index: number) => {
    removeAward(index);
  };

  const handleAddCertificate = () => {
    addCertificate(newCertificate);
    newCertificate = { name: '', date: '', issuer: '', url: '' };
  };

  const handleRemoveCertificate = (index: number) => {
    removeCertificate(index);
  };

  const handleAddPublication = () => {
    addPublication(newPublication);
    newPublication = {
      name: '',
      publisher: '',
      releaseDate: '',
      url: '',
      summary: '',
    };
  };

  const handleRemovePublication = (index: number) => {
    removePublication(index);
  };

  const handleAddSkill = () => {
    addSkill(newSkill);
    newSkill = { name: '', level: '', keywords: [] };
  };

  const handleRemoveSkill = (index: number) => {
    removeSkill(index);
  };

  const handleAddLanguage = () => {
    addLanguage(newLanguage);
    newLanguage = { language: '', fluency: '' };
  };

  const handleRemoveLanguage = (index: number) => {
    removeLanguage(index);
  };

  const handleAddInterest = () => {
    addInterest(newInterest);
    newInterest = { name: '', keywords: [] };
  };

  const handleRemoveInterest = (index: number) => {
    removeInterest(index);
  };

  const handleAddReference = () => {
    addReference(newReference);
    newReference = { name: '', reference: '' };
  };

  const handleRemoveReference = (index: number) => {
    removeReference(index);
  };

  const handleAddProject = () => {
    addProject(newProject);
    newProject = {
      name: '',
      startDate: '',
      endDate: '',
      description: '',
      highlights: [],
      url: '',
    };
  };

  const handleRemoveProject = (index: number) => {
    removeProject(index);
  };

  function updateHighlights(e: Event, index: number) {
    const target = e.target as HTMLTextAreaElement;
    updateWorkExperience(index, { highlights: target.value.split(',') });
  }

  function handleNewHighlightsInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    newHighlights = target.value;
    newWork.highlights = newHighlights.split(',');
  }

  $: tempHighlights = $resume.work.map((work) => work.highlights.join(','));
</script>

<main class="p-6 max-w-3xl mx-auto">
  <h1 class="text-3xl font-bold text-cyan-600">Resume Generator</h1>

  <section class="mt-6">
    <h2 class="text-2xl font-semibold text-yellow-600">Basics</h2>
    <label class="block mt-4">
      Name:
      <input
        type="text"
        bind:value={$resume.basics.name}
        on:input={() => updateBasics({ name: $resume.basics.name })}
        class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
      />
    </label>
    <label class="block mt-4">
      Label:
      <input
        type="text"
        bind:value={$resume.basics.label}
        on:input={() => updateBasics({ label: $resume.basics.label })}
        class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
      />
    </label>
    <label class="block mt-4">
      Image:
      <input
        type="text"
        bind:value={$resume.basics.image}
        on:input={() => updateBasics({ image: $resume.basics.image })}
        class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
      />
    </label>
    <label class="block mt-4">
      Email:
      <input
        type="email"
        bind:value={$resume.basics.email}
        on:input={() => updateBasics({ email: $resume.basics.email })}
        class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
      />
    </label>
    <label class="block mt-4">
      Phone:
      <input
        type="tel"
        bind:value={$resume.basics.phone}
        on:input={() => updateBasics({ phone: $resume.basics.phone })}
        class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
      />
    </label>
    <label class="block mt-4">
      URL:
      <input
        type="url"
        bind:value={$resume.basics.url}
        on:input={() => updateBasics({ url: $resume.basics.url })}
        class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
      />
    </label>
    <label class="block mt-4">
      Summary:
      <textarea
        bind:value={$resume.basics.summary}
        on:input={() => updateBasics({ summary: $resume.basics.summary })}
        class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
      ></textarea>
    </label>
    <fieldset class="mt-4">
      <legend class="text-lg font-semibold">Location</legend>
      <label class="block mt-4">
        Address:
        <input
          type="text"
          bind:value={$resume.basics.location.address}
          on:input={() =>
            updateBasics({
              location: {
                ...$resume.basics.location,
                address: $resume.basics.location.address,
              },
            })}
          class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
        />
      </label>
      <label class="block mt-4">
        Postal Code:
        <input
          type="text"
          bind:value={$resume.basics.location.postalCode}
          on:input={() =>
            updateBasics({
              location: {
                ...$resume.basics.location,
                postalCode: $resume.basics.location.postalCode,
              },
            })}
          class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
        />
      </label>
      <label class="block mt-4">
        City:
        <input
          type="text"
          bind:value={$resume.basics.location.city}
          on:input={() =>
            updateBasics({
              location: {
                ...$resume.basics.location,
                city: $resume.basics.location.city,
              },
            })}
          class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
        />
      </label>
      <label class="block mt-4">
        Country Code:
        <input
          type="text"
          bind:value={$resume.basics.location.countryCode}
          on:input={() =>
            updateBasics({
              location: {
                ...$resume.basics.location,
                countryCode: $resume.basics.location.countryCode,
              },
            })}
          class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
        />
      </label>
      <label class="block mt-4">
        Region:
        <input
          type="text"
          bind:value={$resume.basics.location.region}
          on:input={() =>
            updateBasics({
              location: {
                ...$resume.basics.location,
                region: $resume.basics.location.region,
              },
            })}
          class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
        />
      </label>
    </fieldset>

    <fieldset class="mt-4">
      <legend class="text-lg font-semibold">Profiles</legend>
      {#each $resume.basics.profiles as profile, index}
        <div class="mt-4">
          <label class="block">
            Network:
            <input
              type="text"
              bind:value={profile.network}
              on:input={() =>
                updateProfile(index, { network: profile.network })}
              class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
            />
          </label>
          <label class="block mt-4">
            Username:
            <input
              type="text"
              bind:value={profile.username}
              on:input={() =>
                updateProfile(index, { username: profile.username })}
              class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
            />
          </label>
          <label class="block mt-4">
            URL:
            <input
              type="url"
              bind:value={profile.url}
              on:input={() => updateProfile(index, { url: profile.url })}
              class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
            />
          </label>
          <button
            type="button"
            on:click={() => handleRemoveProfile(index)}
            class="mt-2 bg-red-500 text-white px-3 py-1 rounded">Remove</button
          >
        </div>
      {/each}
      <div class="mt-4">
        <label class="block">
          Network:
          <input
            type="text"
            bind:value={newProfile.network}
            class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
          />
        </label>
        <label class="block mt-4">
          Username:
          <input
            type="text"
            bind:value={newProfile.username}
            class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
          />
        </label>
        <label class="block mt-4">
          URL:
          <input
            type="url"
            bind:value={newProfile.url}
            class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
          />
        </label>
        <button
          type="button"
          on:click={handleAddProfile}
          class="mt-2 bg-cyan-500 text-white px-3 py-1 rounded"
          >Add Profile</button
        >
      </div>
    </fieldset>

    <fieldset class="mt-4">
      <legend class="text-lg font-semibold">Work Experience</legend>
      {#each $resume.work as work, index}
        <div class="mt-4">
          <label class="block">
            Company Name:
            <input
              type="text"
              bind:value={work.name}
              on:input={() => updateWorkExperience(index, { name: work.name })}
              class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
            />
          </label>
          <label class="block mt-4">
            Position:
            <input
              type="text"
              bind:value={work.position}
              on:input={() =>
                updateWorkExperience(index, { position: work.position })}
              class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
            />
          </label>
          <label class="block mt-4">
            URL:
            <input
              type="url"
              bind:value={work.url}
              on:input={() => updateWorkExperience(index, { url: work.url })}
              class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
            />
          </label>
          <label class="block mt-4">
            Start Date:
            <input
              type="date"
              bind:value={work.startDate}
              on:input={() =>
                updateWorkExperience(index, { startDate: work.startDate })}
              class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
            />
          </label>
          <label class="block mt-4">
            End Date:
            <input
              type="date"
              bind:value={work.endDate}
              on:input={() =>
                updateWorkExperience(index, { endDate: work.endDate })}
              class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
            />
          </label>
          <label class="block mt-4">
            Summary:
            <textarea
              bind:value={work.summary}
              on:input={() =>
                updateWorkExperience(index, { summary: work.summary })}
              class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
            ></textarea>
          </label>
          <label class="block mt-4">
            Highlights:
            <textarea
              bind:value={tempHighlights[index]}
              on:input={(e) => updateHighlights(e, index)}
              class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
            ></textarea>
          </label>
          <button
            type="button"
            on:click={() => handleRemoveWork(index)}
            class="mt-2 bg-red-500 text-white px-3 py-1 rounded">Remove</button
          >
        </div>
      {/each}
      <div class="mt-4">
        <label class="block">
          Company Name:
          <input
            type="text"
            bind:value={newWork.name}
            class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
          />
        </label>
        <label class="block mt-4">
          Position:
          <input
            type="text"
            bind:value={newWork.position}
            class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
          />
        </label>
        <label class="block mt-4">
          URL:
          <input
            type="url"
            bind:value={newWork.url}
            class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
          />
        </label>
        <label class="block mt-4">
          Start Date:
          <input
            type="date"
            bind:value={newWork.startDate}
            class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
          />
        </label>
        <label class="block mt-4">
          End Date:
          <input
            type="date"
            bind:value={newWork.endDate}
            class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
          />
        </label>
        <label class="block mt-4">
          Summary:
          <textarea
            bind:value={newWork.summary}
            class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
          ></textarea>
        </label>
        <label class="block mt-4">
          Highlights:
          <textarea
            bind:value={newHighlights}
            on:input={handleNewHighlightsInput}
            class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
          ></textarea>
        </label>
        <button
          type="button"
          on:click={handleAddWork}
          class="mt-2 bg-cyan-500 text-white px-3 py-1 rounded"
          >Add Work Experience</button
        >
      </div>
    </fieldset>

  </section>

  <pre class="mt-6 p-4 bg-gray-100 rounded-md shadow-md">{JSON.stringify(
      $resume,
      null,
      2,
    )}</pre>
</main>
