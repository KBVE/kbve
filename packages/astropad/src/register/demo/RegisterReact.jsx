
import React, { useEffect, useState, useRef } from 'react';


function RegisterReact({ labels, errors }) {
    const [formData, setFormData] = useState({
      username: '',
      email: '',
      password: '',
    });
    const [formErrors, setFormErrors] = useState({});
  
    const handleChange = (e) => {
      const { name, value } = e.target;
      setFormData({
        ...formData,
        [name]: value,
      });
    };
  
    const validate = () => {
      const newErrors = {};
      if (!formData.username) newErrors.username = errors.username;
      if (!formData.email) newErrors.email = errors.email;
      if (!formData.password) newErrors.password = errors.password;
      setFormErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    };
  
    const handleSubmit = (e) => {
      e.preventDefault();
      if (validate()) {
        console.log('Form submitted:', formData);
      }
    };
  
    return (
      <form onSubmit={handleSubmit}>
        <div>
          <label>{labels.username}</label>
          <input
            type="text"
            name="username"
            value={formData.username}
            onChange={handleChange}
          />
          {formErrors.username && <span>{formErrors.username}</span>}
        </div>
        <div>
          <label>{labels.email}</label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
          />
          {formErrors.email && <span>{formErrors.email}</span>}
        </div>
        <div>
          <label>{labels.password}</label>
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
          />
          {formErrors.password && <span>{formErrors.password}</span>}
        </div>
        <button type="submit">{labels.submit}</button>
      </form>
    );
  }
  
  export default RegisterReact;