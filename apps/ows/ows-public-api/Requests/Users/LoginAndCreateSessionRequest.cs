using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using OWSData.Models.StoredProcs;
using OWSData.Repositories.Interfaces;
using OWSShared.Interfaces;
using Serilog;

namespace OWSPublicAPI.Requests.Users
{
    public class LoginAndCreateSessionRequest : IRequestHandler<LoginAndCreateSessionRequest, IActionResult>, IRequest
    {
        public string Email { get; set; }
        public string Password { get; set; }

        private PlayerLoginAndCreateSession output;
        private Guid customerGUID;
        private IUsersRepository usersRepository;

        public void SetData(IUsersRepository usersRepository, IHeaderCustomerGUID customerGuid)
        {
            this.customerGUID = customerGuid.CustomerGUID;
            this.usersRepository = usersRepository;
        }

        public async Task<IActionResult> Handle()
        {
            try
            {
                output = await usersRepository.LoginAndCreateSession(customerGUID, Email, Password, false);

                if (output == null)
                {
                    Log.Error("LoginAndCreateSession returned null for {Email}", Email);
                    return new StatusCodeResult(500);
                }

                if (!output.Authenticated || !output.UserSessionGuid.HasValue || output.UserSessionGuid == Guid.Empty)
                {
                    output.ErrorMessage = "Username or Password is invalid!";
                }

                return new OkObjectResult(output);
            }
            catch (Exception ex)
            {
                Log.Error(ex, "LoginAndCreateSession failed for {Email} with CustomerGUID {CustomerGUID}", Email, customerGUID);
                return new StatusCodeResult(500);
            }
        }
    }
}
