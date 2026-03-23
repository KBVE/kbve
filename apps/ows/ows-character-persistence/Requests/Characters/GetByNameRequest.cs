using Microsoft.AspNetCore.Mvc;
using OWSData.Models.StoredProcs;
using OWSData.Repositories.Interfaces;
using OWSShared.Interfaces;
using Serilog;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace OWSCharacterPersistence.Requests.Characters
{
    public class GetByNameRequest
    {
        public string CharacterName { get; set; }

        private GetCharByCharName output;
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
                output = await charactersRepository.GetCharByCharName(customerGUID, CharacterName);

                return new OkObjectResult(output);
            }
            catch (Exception ex)
            {
                Log.Error(ex, "GetByNameRequest.Handle failed");
                return new StatusCodeResult(500);
            }
        }
    }
}
