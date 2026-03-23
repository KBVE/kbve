using Microsoft.AspNetCore.Mvc;
using OWSData.Models.Composites;
using OWSData.Repositories.Interfaces;
using OWSShared.Interfaces;
using OWSShared.RequestPayloads;
using Serilog;
using System;
using System.Threading.Tasks;

namespace OWSInstanceManagement.Requests.Instance
{
    public class ShutDownInstanceLauncherRequest
    {
        public WorldServerIDRequestPayload Request { get; set; }

        private SuccessAndErrorMessage _output;
        private IInstanceManagementRepository _instanceManagementRepository;
        private Guid _customerGUID;

        public void SetData(IInstanceManagementRepository instanceManagementRepository, IHeaderCustomerGUID customerGuid)
        {
            _instanceManagementRepository = instanceManagementRepository;
            _customerGUID = customerGuid.CustomerGUID;
        }

        public async Task<IActionResult> Handle()
        {
            try
            {
                _output = await _instanceManagementRepository.ShutDownWorldServer(_customerGUID, Request.WorldServerID);

                return new OkObjectResult(_output);
            }
            catch (Exception ex)
            {
                Log.Error(ex, "ShutDownInstanceLauncherRequest.Handle failed");
                return new StatusCodeResult(500);
            }
        }
    }
}
