using Microsoft.AspNetCore.Mvc;
using OWSData.Repositories.Interfaces;
using OWSShared.Interfaces;
using Serilog;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace OWSCharacterPersistence.Requests.Abilities
{
    /// <summary>
    /// Get Ability Bars
    /// </summary>
    /// <remarks>
    /// Get a list of ability bars this character has.
    /// </remarks>
    public class GetAbilityBarsRequest
    {
        /// <summary>
        /// Character Name
        /// </summary>
        /// <remarks>
        /// This is the name of the character to get ability bars for.
        /// </remarks>
        public string CharacterName { get; set; }

        private IEnumerable<OWSData.Models.StoredProcs.GetAbilityBars> output;
        private Guid customerGUID;
        private ICharactersRepository charactersRepository;

        public void SetData(ICharactersRepository charactersRepository, IHeaderCustomerGUID customerGuid)
        {
            this.charactersRepository = charactersRepository;
            customerGUID = customerGuid.CustomerGUID;
        }

        public async Task<IActionResult> Handle()
        {
            try
            {
                output = await charactersRepository.GetAbilityBars(customerGUID, CharacterName);

                return new OkObjectResult(output);
            }
            catch (Exception ex)
            {
                Log.Error(ex, "GetAbilityBarsRequest.Handle failed");
                return new StatusCodeResult(500);
            }
        }
    }
}
