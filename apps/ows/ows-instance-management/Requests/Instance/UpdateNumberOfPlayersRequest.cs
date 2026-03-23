using Microsoft.AspNetCore.Mvc;
using OWSData.Repositories.Interfaces;
using OWSShared.Interfaces;
using Serilog;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;

namespace OWSInstanceManagement.Requests.Instance
{
    /// <summary>
    /// UpdateNumberOfPlayersRequest
    /// </summary>
    /// <remarks>
    /// Update the number of players on a zone instance by matching it to the port and IP
    /// </remarks>
    public class UpdateNumberOfPlayersRequest
    {
        //Request Parameters
        public int ZoneInstanceId { get; set; }
        public int NumberOfConnectedPlayers { get; set; }

        //Private objects
        private Guid CustomerGUID;
        private IInstanceManagementRepository _instanceMangementRepository;

        public void SetData(IInstanceManagementRepository instanceMangementRepository, IHeaderCustomerGUID customerGuid)
        {
            CustomerGUID = customerGuid.CustomerGUID;
            _instanceMangementRepository = instanceMangementRepository;
        }

        public async Task<IActionResult> Handle()
        {
            try
            {
                var output = await _instanceMangementRepository.UpdateNumberOfPlayers(CustomerGUID, ZoneInstanceId, NumberOfConnectedPlayers);

                return new OkObjectResult(output);
            }
            catch (Exception ex)
            {
                Log.Error(ex, "UpdateNumberOfPlayersRequest.Handle failed");
                return new StatusCodeResult(500);
            }
        }
    }
}
