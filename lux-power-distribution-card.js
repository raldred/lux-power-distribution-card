class LuxPowerDistributionCard extends HTMLElement {
  set hass(hass) {
    this._hass = hass;

    if (!this.card) {
      this.createCard();
      this.bindRefresh(this.card, this._hass, this.config);
      this.bindHistoryGraph(this.card, this._hass, this.config);
    }

    this.updateCard();
  }

  setConfig(config) {
    if (!config.battery_soc || !config.battery_soc.entity) {
      throw new Error("You need to define an entity for the battery SOC.");
    }
    if (!config.battery_flow || !config.battery_flow.entity) {
      throw new Error("You need to define an entity for the battery flow.");
    }
    if (!config.home_consumption || !config.home_consumption.entity) {
      throw new Error("You need to define an entity for the home consumption.");
    }
    if (!config.grid_flow || !config.grid_flow.entity) {
      throw new Error("You need to define an entity for the grid flow.");
    }
    this.config = JSON.parse(JSON.stringify(config));

    // Optional parameters for more interactive card
    if (!this.config.grid_indicator_dot) {
      this.config.grid_indicator_dot = false;
    }
    if (!this.config.grid_indicator_hue) {
      this.config.grid_indicator_hue = false;
    }
    if (!this.config.update_time_timestamp_attribute) {
      this.config.update_time_timestamp_attribute = false;
    }
    if (!this.config.use_lux_status_codes) {
      this.config.use_lux_status_codes = false;
    }
    if (!this.config.refresh_button_location) {
      this.config.refresh_button_location = "none";
    }
  }

  createCard() {
    if (this.card) {
      this.card.remove();
    }

    this.card = document.createElement("ha-card");
    if (this.config.header) {
      this.card.header = this.config.header;
    }

    const content = document.createElement("div");
    this.card.appendChild(content);

    this.styles = document.createElement("style");
    this.card.appendChild(this.styles);

    this.appendChild(this.card);

    content.innerHTML = `
      <ha-card>
        <div id="grid-status-info" class="grid-status">
        </div>
        <div class="diagram-grid">
        </div>
        <div id="datetime-info" class="update-time">
        </div>
      </ha-card>
    `;

    this.nodes = {
      content: content,
    };

    this.generateStyles();
    this.generateGrid();
    this.generateDateTime();
    this.generateStatus();
  }

  connectedCallback() {
    this.updateCard();

    this.intervalId = setInterval(() => {
      this.updateCard();
    }, 1000);
  }

  disconnectedCallback() {
    clearInterval(this.intervalId);
  }

  updateCard() {
    if (
      this._hass.states[this.config["battery_soc"].entity] == undefined ||
      this._hass.states[this.config["battery_flow"].entity] == undefined ||
      this._hass.states[this.config["home_consumption"].entity] == undefined ||
      this._hass.states[this.config["grid_flow"].entity] == undefined
    ) {
      console.warn("Undefined entity");
      if (this.card) {
        this.card.remove();
      }

      this.card = document.createElement("ha-card");
      if (this.config.header) {
        this.card.header = this.config.header;
      }

      const content = document.createElement("p");
      content.style.background = "#e8e87a";
      content.style.padding = "8px";
      content.innerHTML = "Error finding entities.";
      this.card.appendChild(content);

      this.appendChild(this.card);
      return;
    } else if (this.card && this.card.firstElementChild.tagName.toLowerCase() == "p") {
      this.createCard();
    }
    this.updateStates();
  }

  updateStates() {
    if (this.card) {
      this.generateDateTime();
      this.updateBattery();
      this.updateSolar();
      this.updateGrid();
      this.updateHome();
      this.updateAllocatedPower();
      this.generateStatus();
    }
  }

  updateBattery() {
    const battery_arrow_element = this.card.querySelector("#battery-arrows");
    const battery_soc = this.getConfigEntityState("battery_soc");
    // Image
    const battery_image_element = this.card.querySelector("#battery-image");
    if (battery_image_element) {
      battery_image_element.innerHTML = `<img src="${this.getBase64Data(
        this.getBatteryLevel(parseInt(battery_soc))
      )}">`;
    }
    if (this.config.battery_flow && this.config.battery_flow.entity) {
      // Arrow
      const battery_flow = this.getConfigEntityState("battery_flow");
      const arrow_direction = battery_flow < 0 ? "arrows-right" : battery_flow > 0 ? "arrows-left" : "arrows-none";
      if (battery_arrow_element.className != `cell arrow-cell ${arrow_direction}`) {
        if (arrow_direction != "arrows-none") {
          if (battery_arrow_element) {
            battery_arrow_element.setAttribute("class", `cell arrow-cell ${arrow_direction}`);
            battery_arrow_element.innerHTML = this.generateArrows();
          }
        } else {
          battery_arrow_element.innerHTML = ``;
        }
      }
      // Charge info
      const battery_charge_info_element = this.card.querySelector("#battery-charge-info");
      battery_charge_info_element.innerHTML = `
        <div>
          <p class="header-text">${this.formatPowerStates("battery_flow")}</p>
          <p class="sub-text">${
            battery_flow > 0 ? "Battery Charging" : battery_flow < 0 ? "Battery Discharging" : "Idle"
          }</p>
        </div>
      `;
    }
    var battery_voltage = "";
    if (this.config.battery_voltage && this.config.battery_voltage.entity) {
      battery_voltage = `${this.getConfigEntityState("battery_voltage")} Vdc`;
    }
    const battery_soc_info_element = this.card.querySelector("#battery-soc-info");
    if (battery_soc_info_element) {
      battery_soc_info_element.innerHTML = `
        <div>
          <p class="header-text">${battery_soc}%</p>
          <p class="header-text">${battery_voltage}</p>
        </div>
    `;
    }
  }

  updateSolar() {
    const solar_arrow_element = this.card.querySelector("#solar-arrows");
    const solar_info_element = this.card.querySelector("#solar-info");
    if (solar_arrow_element && solar_info_element) {
      // Arrow
      const pv_power = parseInt(this.getConfigEntityState("pv_power"));
      const arrow_direction = pv_power > 0 ? "arrows-down" : "arrows-none";
      if (solar_arrow_element.className != `cell arrow-cell ${arrow_direction}`) {
        if (arrow_direction != "arrows-none") {
          solar_arrow_element.setAttribute("class", `cell arrow-cell ${arrow_direction}`);
          solar_arrow_element.innerHTML = this.generateArrows();
        } else {
          solar_arrow_element.setAttribute("class", `cell arrow-cell arrows-none`);
          solar_arrow_element.innerHTML = ``;
        }
      }
      // Info
      solar_info_element.innerHTML = `
        <div>
          <p class="header-text">${this.formatPowerStates("pv_power")}</p>
          <p class="sub-text">${pv_power > 0 ? "Solar Import" : ""}</p>
        </div>
      `;
    }
  }

  updateGrid() {
    // Arrow
    const grid_arrow_1_element = this.card.querySelector("#grid-arrows-1");
    const grid_arrow_2_element = this.card.querySelector("#grid-arrows-2");
    if (grid_arrow_1_element && grid_arrow_2_element) {
      const grid_flow = parseInt(this.getConfigEntityState("grid_flow"));
      const arrow_direction = grid_flow < 0 ? "arrows-left" : grid_flow > 0 ? "arrows-right" : "arrows-none";
      if (grid_arrow_1_element.className != `cell arrow-cell ${arrow_direction}`) {
        if (arrow_direction != "arrows-none") {
          grid_arrow_1_element.setAttribute("class", `cell arrow-cell ${arrow_direction}`);
          grid_arrow_2_element.setAttribute("class", `cell arrow-cell ${arrow_direction}`);
          grid_arrow_1_element.innerHTML = this.generateArrows();
          grid_arrow_2_element.innerHTML = this.generateArrows();
        } else {
          grid_arrow_1_element.setAttribute("class", `cell arrow-cell arrows-none`);
          grid_arrow_2_element.setAttribute("class", `cell arrow-cell arrows-none`);
          grid_arrow_2_element.innerHTML = ``;
          grid_arrow_2_element.innerHTML = ``;
        }
      }
    }
    var grid_emoji = ``;
    if (this.config.grid_voltage && this.config.grid_voltage.entity) {
      var grid_voltage = parseInt(this.getConfigEntityState("grid_voltage"));
      const grid_image_element = this.card.querySelector("#grid-image");
      if (this.config.grid_indicator_hue) {
        grid_image_element.setAttribute(
          "class",
          grid_voltage == 0 ? `cell image-cell blend-overlay` : `cell image-cell`
        );
      }
      if (this.config.grid_indicator_dot) {
        grid_emoji = grid_voltage == 0 ? ` 🔴` : ``;
      }
    }

    // Info
    const grid_info_element = this.card.querySelector("#grid-info");
    if (grid_info_element) {
      grid_info_element.innerHTML = `
        <div>
          <p class="header-text">${this.formatPowerStates("grid_flow")}</p>
          <p class="header-text">${
            this.config.grid_voltage && this.config.grid_voltage.entity
              ? `${this.getConfigEntityState("grid_voltage")} Vac${grid_emoji}`
              : ""
          }</p>
        </div>
      `;
    }
  }

  updateHome() {
    // Arrow
    const home_arrow_element = this.card.querySelector("#home-arrows");
    if (home_arrow_element) {
      const backup_power =
        this.config.backup_power && this.config.backup_power.entity
          ? parseInt(this.getConfigEntityState("backup_power"))
          : 0;
      const home_consumption = parseInt(this.getConfigEntityState("home_consumption"));
      const arrow_direction = home_consumption > 0 || backup_power > 0 ? "arrows-down" : "arrows-none";
      if (home_arrow_element.className != `cell arrow-cell ${arrow_direction}`) {
        if (arrow_direction != "arrows-none") {
          home_arrow_element.setAttribute("class", `cell arrow-cell ${arrow_direction}`);
          home_arrow_element.innerHTML = this.generateArrows();
        } else {
          home_arrow_element.setAttribute("class", `cell arrow-cell arrows-none`);
          home_arrow_element.innerHTML = ``;
        }
      }
    }
    // Info
    const home_info_element = this.card.querySelector("#home-info");
    if (home_info_element) {
      var sub_text = "Home Usage";
      var value = this.formatPowerStates("home_consumption");

      if (
        this.config.backup_power &&
        this.config.backup_power.entity &&
        parseInt(this.getConfigEntityState("home_consumption")) == 0 &&
        parseInt(this.getConfigEntityState("backup_power")) > 0
      ) {
        sub_text = "Backup Power";
        value = this.formatPowerStates("backup_power");
      }

      home_info_element.innerHTML = `
        <div>
          <p class="sub-text">${sub_text}</p>
          <p class="header-text">${value}</p>
        </div>
      `;
    }
  }

  updateAllocatedPower() {
    // Arrow
    const power_allocation_arrow_element = this.card.querySelector("#power-allocation-arrows");
    if (power_allocation_arrow_element) {
      if (power_allocation_arrow_element.className != `cell arrow-cell arrows-right`) {
        power_allocation_arrow_element.setAttribute("class", `cell arrow-cell arrows-right`);
        power_allocation_arrow_element.innerHTML = this.generateArrows();
      }

      const power_allocation_info_element = this.card.querySelector("#power-allocation-info");
      power_allocation_info_element.innerHTML = `
        <div>
          <p class="sub-text">Allocated Power</p>
          <p class="header-text">${parseInt(this.getAllocatedPower())} W</p>
        </div>
      `;
    }
  }

  generateStyles() {
    this.styles.innerHTML = `
      /* CARD */
      ha-card {
        width: auto;
        padding: 1px;
      }

      /* GRID */
      .diagram-grid {
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        grid-template-rows: repeat(${this.config.pv_power && this.config.pv_power.entity ? 5 : 4}, 1fr);
      }
      .diagram-grid img {
        max-width: 100%;
        max-height: 100%;
      }
      
      /* CELLS */
      .cell {
        /* border: 1px solid #ccc; */
        width: 100%;
        height: auto;
      }
      
      /* TEXT */
      .text-cell {
        /*max-height: 100%;*/
        display: flex;
        /*text-overflow: ellipsis;
        flex-wrap: wrap;
        word-wrap: break-word;*/ /* Allow the text to wrap within the cell */
      }
      /* .text-cell left {
        justify-content: left;
        text-align: left;
      }
      .text-cell right {
        justify-content: right;
        text-align: right;
      } */
      .header-text { 
        font-size: min(4vw, 1.17em);
        font-weight: bold;
        line-height: 1;
        margin: 0;
        padding-left: 3px;
        padding-right: 3px;
      }
      .sub-text { 
        font-size: min(2.5vw, 0.95em);
        line-height: 1;
        margin: 0;
        padding-left: 3px;
        padding-right: 3px;
      }
      
      /* IMAGE CELLS */
      .image-cell img {
        margin: auto;
        display: flex;
        align-items: center;
        text-align: center;
        justify-content: center;
        width: auto;

        object-fit: contain;
        position: relative;
      }
      
      .blend-overlay {
        mix-blend-mode: overlay;
      }
      
      /* ARROWS */
      .arrow-cell {
        margin: auto;
        display: flex;
        align-items: center;
        text-align: center;
        justify-content: center;
        width: auto;
        object-fit: contain;
        position: relative;
      }
      .arrows-left {
        transform: rotate(0deg);
      }
      .arrows-up {
        transform: rotate(90deg);
      }
      .arrows-right {
        transform: rotate(180deg);
      }
      .arrows-down {
        transform: rotate(-90deg);
      }
      .arrows-none {
        opacity: 0;
      }

      /* ARROW ANIMATIONS*/
      .arrow-1 img {
        animation: arrow-animation-1 1.5s infinite;
      }
      .arrow-2 img {
        animation: arrow-animation-2 1.5s infinite;
      }
      .arrow-3 img {
        animation: arrow-animation-3 1.5s infinite;
      }
      .arrow-4 img {
        animation: arrow-animation-4 1.5s infinite;
      }
      @keyframes arrow-animation-1 {
        0%, 100% {opacity: 1;}
        25%, 50%, 75% {opacity: 0.4;}
      }
      @keyframes arrow-animation-2 {
        0%, 25%, 50%, 100% {opacity: 0.4;}
        75% {opacity: 1;}
      }
      @keyframes arrow-animation-3 {
        0%, 25%, 75%, 100% {opacity: 0.4;}
        50% {opacity: 1;}
      }
      @keyframes arrow-animation-4 {
        0%, 25%, 75%, 100% {opacity: 0.4;}
        25% {opacity: 1;}
      }

      /* TIME AND DATE */
      .update-time {
        text-align: left;
        margin: 0;
        line-height: 1;
      }
      .grid-status {
        text-align: right;
        margin: 0;
        line-height: 1;
      }
    `;
  }

  generateGrid() {
    this.generateCells();
  }

  generateCells() {
    var cells = ``;

    // Row 1
    cells += this.generateSolarCells();

    // Row 2
    cells += `<div id="battery-image" class="cell image-cell"><img src="${this.getBase64Data("battery-0")}"></div>`; // Battery image
    cells += `<div id="battery-arrows" class="cell arrow-cell"></div>`; // Battery arrows
    cells += `<div id="inverter-image" class="cell image-cell"><img src="${this.getBase64Data("inverter")}"></div>`; // Inverter image
    cells += `<div id="grid-arrows-1" class="cell arrow-cell"></div>`; // Grid arrows 1
    cells += `<div id="grid-arrows-2" class="cell arrow-cell"></div>`; // Grid arrows 2
    cells += `<div id="grid-image" class="cell image-cell"><img src="${this.getBase64Data("grid")}"></div>`; // Grid image

    // Row 3
    cells += `<div id="battery-soc-info" class="cell text-cell"></div>`; // Battery SOC info
    cells += `<div class="cell"></div>`;
    cells += `<div id="home-arrows" class="cell arrow-cell"></div>`; // Home arrows
    cells += `<div class="cell"></div>`;
    cells += `<div class="cell"></div>`;
    cells += `<div id="grid-info" class="cell text-cell"></div>`; // Grid info

    // Row 4
    cells += this.generateHomeCells();

    const grid = this.card.getElementsByClassName("diagram-grid");
    grid[0].innerHTML = cells;
  }

  generateSolarCells() {
    var cells = ``;
    var refresh_button = ``;
    if (this.config.lux_dongle && ["right", "both"].includes(String(this.config.refresh_button_location))) {
      refresh_button = `
        <button id="refresh-button-right" class="icon-button">
          <ha-icon icon="mdi:cloud-refresh"></ha-icon>
        </button>
      `;
    }
    if (this.config.pv_power && this.config.pv_power.entity) {
      // Row 0
      cells += `<div class="cell"></div>`;
      cells += `<div class="cell"></div>`;
      cells += `<div id="solar-image" class="cell image-cell"><img src="${this.getBase64Data("solar")}"></div>`; // Solar image
      cells += `<div id="solar-info" class="cell text-cell"></div>`; // Solar info
      cells += `<div class="cell"></div>`;
      cells += `<div class="cell"></div>`;
      // Row 1
      cells += `<div id="battery-charge-info" class="cell text-cell"></div>`; // Battery charge/discharge info
      cells += `<div class="cell"></div>`;
      cells += `<div id="solar-arrows" class="cell arrow-cell"></div>`; // Solar arrows
      cells += `<div class="cell"></div>`;
      cells += `<div class="cell"></div>`;
      cells += `<div class="cell">${refresh_button}</div>`;
    } else {
      // Row 1
      cells += `<div id="battery-charge-info" class="cell text-cell"></div>`; // Battery charge/discharge info
      cells += `<div class="cell"></div>`;
      cells += `<div class="cell"></div>`;
      cells += `<div class="cell"></div>`;
      cells += `<div class="cell"></div>`;
      cells += `<div class="cell">${refresh_button}</div>`;
    }
    return cells;
  }

  generateHomeCells() {
    var cells = ``;
    var refresh_button = ``;
    if (this.config.lux_dongle && ["left", "both"].includes(String(this.config.refresh_button_location))) {
      refresh_button = `
        <button id="refresh-button-left" class="icon-button">
          <ha-icon icon="mdi:cloud-refresh"></ha-icon>
        </button>
      `;
    }

    if (this.config.energy_allocations && this.config.energy_allocations.entities) {
      // Power Allocations
      cells += `<div class="cell">${refresh_button}</div>`;
      cells += `<div id="home-info" class="cell text-cell"></div>`; // Home info
      cells += `<div id="home-image" class="cell image-cell"><img src="${this.getBase64Data("home-normal")}"></div>`; // Home image
      cells += `<div id="power-allocation-arrows" class="cell arrow-cell"></div>`; // Power allocation arrows
      cells += `<div id="power-allocation-image" class="cell image-cell"><img src="${this.getBase64Data(
        "home-normal"
      )}"></div>`; // Power allocation image
      cells += `<div id="power-allocation-info" class="cell text-cell"></div>`; // Power allocation info
    } else {
      cells += `<div class="cell">${refresh_button}</div>`;
      cells += `<div id="home-info" class="cell text-cell"></div>`; // Home info
      cells += `<div id="home-image" class="cell image-cell"><img src="${this.getBase64Data("home-normal")}"></div>`; // Home image
      cells += `<div class="cell"></div>`;
      cells += `<div class="cell"></div>`;
      cells += `<div class="cell"></div>`;
    }
    return cells;
  }

  generateArrows() {
    var inner_html = ``;
    for (let i = 1; i < 5; i++) {
      inner_html += `<div class="arrow-${i}"><img src="${this.getBase64Data("arrow")}"></div>`;
    }
    return inner_html;
  }

  generateDateTime() {
    if (this.config.update_time && this.config.update_time.entity) {
      var last_time = this.getConfigEntityState("update_time");

      const date_time_info = this.card.querySelector("#datetime-info");
      if (this.config.update_time_timestamp_attribute) {
        var last_time_ts = this.getConfigEntityAttribute("update_time", "timestamp");
        var time_now = Date.now() / 1000;
        var diff = time_now - last_time_ts;

        var time_since = ``;
        switch (true) {
          case diff <= 2:
            time_since = `now`;
            break;
          case diff < 60:
            time_since = `${Math.round(diff)} seconds ago`;
            break;
          case diff < 120:
            time_since = `1 minute ago`;
            break;
          case diff >= 120:
            time_since = `${Math.round(diff / 60)} minutes ago`;
            break;
        }

        date_time_info.innerHTML = `
          <p class="update-time">Last update at: ${last_time}</p>
          <p class="update-time">(${time_since})</p>
        `;
      } else {
        date_time_info.innerHTML = `
          <p class="update-time">Last update at: ${last_time}</p>
        `;
      }
    }
  }

  generateStatus() {
    if (this.config.use_lux_status_codes) {
      var grid_status = `Status: Normal 🟢`;
      const status_info = this.card.querySelector("#grid-status-info");
      if (this.config.lux_fail_status_codes && this.config.lux_status_code && this.config.lux_status_code.entity) {
        if (this.config.lux_fail_status_codes.includes(parseInt(this.getConfigEntityState("lux_status_code")))) {
          grid_status = `Status: Warning 🔴`;
        }
      }
      status_info.innerHTML = `
        <p class="grid-status">${grid_status}</p>
      `;
    }
  }

  getBase64Data(image_name) {
    switch (image_name) {
      case "arrow":
        return `data:image/png;base64,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`;
      case "battery-0":
        return `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFYAAABWCAYAAABVVmH3AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAPGSURBVHhe7Z1LTFNBFIZPK1AKlYcCwcQXGiMkstKQqOCSEF2ARrryEdfGJeAOxI3AkrUxuqMkAhtN2IKakLgwJspGE40r8IEEKOXROtMeQ0goVNJ/7qmcL7npP3fBTD96Z+beTu/1kYe0DXU9JF/iLlG8jMifpbbEE+ZvzSXINzgW7uvmnc7xTGxrpHPSVH6RixCM4Vdj4f5GLjrFz69OaY10PUBLtdg6kkeFB3gi1keJexzxJLsa93giNtWnusJlXRt4JDZbA1UmuKxrA4/E/v+oWBDww6Q90hNaTSw9JV+82RSLvTo0U/NbWqSEfzzfV3R7ONyzkNqPAfom2yL3z5o3NGFiMLVHDFHzD24aDT96y+WsAxOb/KTS0oyJ0qT+JRpbiVa/vDE4z+WsAutjjdQn5kWqVEswUBB8zDnrAAeveAsHweDaCBTrD3EQDK6NsD62LdJpR+FN1B6M0a36y3Si/AIF8tx4j60t0Odfr+nZ+xc0/SPAezcYDfdDHDibx9ZVrFL3pV6qq2x2JtVi67J1Jus2bXCFM7E3z7RQYV4Jl9xj67ZtcIUzsfbw95qTB9xdmnUm1uXhn46CfUWc8DgTu9dQsSBULAgVC0LFglCxIMSKnV/+Tt9+T++4ScXZtYKR9j5OmfHmyzANTE1xKT3P2wc4ZcbV4S5OKXL+WsFeQ6zYTM7Uju+PcpKHWLFVoRpO6TlXLfcLCu0KQKhYECoWhIoFIVZsSaCCU3oK80s5yUOu2MKdxR4KneYkD+0KQKhYECoWhIoFIVrslZo5TrmHaLHBvO1/l3GkrJ6TPLQrAKFiQahYECoWhGixNeUNnHKPnP7EHi6t5SQP7QpAqFgQKhaEaLESFivvFtFiM/kKXCo52xVcP8VBKGLXbllia0s0u/iVS5sJ5BVRZfFRLmWOrt0yWHl2rrrVthupLtFZAQgVC0K0WLtGdrtNFx4bdjN4XRvu4LQ1HQ0NdP5YO5cyQwevHEfFglCxIFQsCBULQsWCULEgRM9j7UnAdtiVMPa6wb/gah4rWiwCPUHIcVQsCBULQsWCULEgVCwIZ2LtzRu9ZmV9iRMeZ2LtHTG95tPPSU54nIkd+jBGy2uQuzZnhK3btsEVzsS+mwlR70QPfZwdp9j6Iu/FY+uyddq6bRtc4eyUVip6Sgsh+WwECECxce+nATsD65NwYhP+cU5yAbYRJja2Gr1jXsTev8n0AcvcRggwsaknYvibTJQoN+ojfyPqqR0W6OBln+WST0VVPkqMmKK7OVZ6Fm1bbJuQz5khIvoDDBAWN8rRzAUAAAAASUVORK5CYII=`;
      case "battery-1":
        return `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFYAAABWCAYAAABVVmH3AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAOUSURBVHhe7Z3NS1RRGMbfO44f2ZB9R9YmJcioFi0i+gYjIiwtaCjJ6D8IKnQhYQgFSh9E6zYtSt2UIS2iTRhhEEIEGoTuyr5LMXVynNt575yojRA2z3vund7fwnnPEeZ5fTz33HOfzfXIIXWdTb3kZbab0vSRq1b84IdPsd7uZNvuYMoBzoyt7WocNeIL7BCCsXisO9leZoeixOynKLVdTY/RpjKsEVwVDnBirEeZnbbEk91qxHFirEFyC3Ky3TkyNu99dbZi8x41FgT8Ojl+++KKyYLRfnMTWWnkjJ6bSzN7vjXHWz82Mm+mbPOd+ub32XkM0BVrjjonJuOj74yX5UbKoakMa5seTC/cE/eWnccA+0uDlcqmhpj0xPTqnlPX3thhToGtWGPqc1uGlnhpYZ8tcw5wK8isskWIwfUINJb31LCD6xH2xXVdjUHM9CfrlqTo5MYDVLFoGxXHE3YWSyo9TsNfn9Ktlw/o1ediO/ube8l2iAdi59iqpdPUsquVqpbtEzOVYS3WDLRND1KIGduwYT+VxOGB1qywNvcghZixfPm7pnLxDlvhETNW8vKfjaKCUlvhETOWbyKu+TEzYSs8Ysbyndk1Q1+e2AqPmLGdA900lR6zI3lYm3uQQszYFx8S1Np7gQY/PqTUzHc7i4e1WJO1uQcpRB8QwkjkHxD+N9RYEGosCDUWhKZbmm7NDU23wGi6BUTTLRCaboHQdAuEplsANN3KMZpuOULTrYihxoJQY0GosSA03dJ0a25ougVG0y0gmm6B0HQLhKZbIDTdAqDpVo7RdMsRmm5FDDUWhBoLQo0FoemWpltzQ9MtMJpuAdF0C4SmWyA03QKh6RYATbdyjKZbjtB0K2KosSDUWBBqLAhRYzndurSnOqjvHm0T+ew4fD7QZG1JxE4FnCyd3XqaHg1fpo4BuUfLRHGcairHaG/FObrSd50GPxXa32SJ/KmAkyVpU5nxVDrQZO28Tbd6htzFhvdfJ0TTLX1AiPpWwDcR3u9cUVoYo84jLXaER8xYTrf4JuKKQ2vH8zfdql5zho6tn6D5RQV2VgbWZO28TbeuPrtBm5YfpJs1zcHc355F//WTNVlb0y1BNN2CgPvfA43NRGDF+rAeccb6sRFbhRdgjzBj05PTW2wZSnipInuEGRu8EcP3GuwwdHimN9RbOxjYqeAX/GqUqfi3fp+8cjvlFI/8tyXpheCX+BD9BIbY5TZGmcafAAAAAElFTkSuQmCC`;
      case "battery-2":
        return `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFYAAABWCAYAAABVVmH3AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAOISURBVHhe7Z3LaxNRFMbPNOnDJAg+d6KmCNYXuBMRESoiUm0VLKIo+BcIWupCaksXQosVxLUbQWmy0UhxIe4U0Y0g2gdIi7r0CSUJjU0Y58zcUkSEUuc7dyY9v82cews5J1/nvr5FrkMW6cr1fiaHNhG5XiusUoLPcsn5VOge2hL0yWNN2M58b9VLnjBNCJ7EtUL3cNI0RWkwT1E681c/okVlOIc/KixgRVhvoG42IR5/qpHHirDBPCiFZK5FLAkrObXbWUYsCVv/qLAg4OPk7P2BbClZHncctyXosTM0F+Za13Xm0tXUzgfnBmb8DhDQN9bb6vSVG8vTjkOeqCyoLVGZID/XwjVxbUE/Btg35TeVv4BpRpJqqdY2dnFkyjRDBfbGeqK+N2FkSaYTb0wYOsCpwF1lggiDqxEorM35dKngaoR9cle+968jz/Z1Fbqw+xhl1+yn5mTG9GKpVIs08/Ml3Xv3hKa+N5veRR51D0M0ENvHtq2fp/6Dg9S24YiYqAzn4px+bq8GKcSEPb/rKLUkV5uWPJyba5BCTFge/rZpXXvARHjEhJUc/v+iKZEyER4xYXkRsc2vWtlEeMSE5ZXZNtM/XpgIj5iwuYkCzVVnTUsezs01SCEm7NsvGRp8PkCTX59SpVYyvXg4F+fk3FyDFKIHhCgS+wPCSkOFBaHCglBhQai7pe7W8lB3C4y6W0DU3QKh7hYIdbdAqLsFQN2tkFF3yxLqbsUMFRaECgtChQWh7pa6W8tD3S0w6m4BUXcLhLpbINTdAqHuFgB1t0JG3S1LqLsVM1RYECosCBUWhKiw7G7dONTuxw9PD4k8R0/2+Tk5tyRiuwJ2lq7su0TPZm7S6ITc0TLTnKSO1lk6nO2hkVe3afJbo/lLQOx3BewsSYvKFCtVPyfnrlt3a2zanm34+ENG1N3SA0LcpwJeRHi+s0WqsYFyp/pNC4+YsOxu8SJiixPbivXrbrVvvUxndpQp3QT/vcg/4Jycu27drVuv79Cejcfpbsc1v2+pe9H/fXJOzq3uliDqbsUMFRaECgtChQUhKqy6WyGg7pYQ6m6BUHcrJPSAIIS6WyDU3QKh7hYIdbdCQhevFQ3ufw8UNhYvLAyYsHxDhgkjC7JGmLC1cm2vCSMJjydkjTBh/RsxXLpumpHD8WpD3drBwHYFCwRXo5TGvVTmEh/buHOp+TT4Eh+i3w5SEpXIQSEuAAAAAElFTkSuQmCC`;
      case "battery-3":
        return `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFYAAABWCAYAAABVVmH3AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAN/SURBVHhe7Z3NS1RRGMbfq44jOvRd+5Qgw6JNIBERGBFhaUGTm/wXgj5sIeHgIrBPokVt2rSamU0Z4SLaFWHQwjA0CP0D+lbGwTvjeLvvvcdcRCB1n/fcGd/fZs45wjyvj/d8PSDXIYv05gbmyKENRJ7fi6qU8Ls8cuZG0yObwjF5rBnbk7+y7JAD1ffI80bTN+tMVxQroj35qz/RpjKsEcwKC1gx1p+oG00TT7DUyGPF2HAdlEJSaxVLxkou7Xa2EUvG1j5qLAj4PDmXzXS4TnGCHK8+HLEzNX+vtZ5TSXrN+3N9mQ/hAAboE9uTG3jg1hUnfS99U9lQW6YyRt+vhWvi2sJxDLDfNHhS2dQYU1osHxjrv/vOdCMF9sT6pk6YZmxpbEqMm2bkAJeClTU1zuBqBBprcz1dK7gaYd/cmx/448qze6tL/XtPUOvmg5RsSJlRLO5SgWZ/vKHHk2P08VvSjK7yNH0D4oHYObZ9W5mGDg9T+/ZjYqYyrMWagbZfgxRixp7vOE5NDVbykADW5hqkEDOWp79t2rYcMi08YsZKTv+/0VjfbFp4xIzlTcQ2pUrRtPCIGcs7s21mvr82LTxixuamRmlxad705GFtrkEKMWPff07R8KsMTX95QW5lwYziYS3WZG2uQQrRC0IcqfoLwnpDjQWhxoJQY0FouqXp1r+h6RYYTbeAaLoFQtMtEJpugdB0C4CmWxGj6ZYlNN2qMtRYEGosCDUWhKixnG5dP9IVtJ+cHRH5zJ6+FmiytiRipwJOli51XqCXs7coOyV3tUwlG6i7bZ6Otl6m2+P3aPprwvwkpOpPBZwsSZvKFNylQJO1azbdej5jLzZ89iklmm7pBaHalwLeRHi9s0Vzoo5yZ4ZMD4+YsZxu8SZii1O7CrWbbnXtvEh9e4rU0ij7fx+sydo1m27deXuf9u04SY+6B4OxtZ5F//eTNVlb0y1BNN2qMtRYEGosCDUWhKixmm5FgKZbQmi6BULTrYjQC4IQmm6B0HQLhKZbIDTdigjdvBQIaiwINRaEGgtC1FhNtyJA0y0hNN0CoelWROgFQQhNt0BougVC0y0Qmm5FhG5e6xrc3x5obFU8sDBwxnpOxbTiC7BGmLElt9xpmrGE5xOyRpix/EYMz6OHphs//NpQb+1gYKeCFcJXoyxM+FIxeeGEV0kut4Bf4kP0C2AQQe5P6M+yAAAAAElFTkSuQmCC`;
      case "battery-4":
        return `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFYAAABWCAYAAABVVmH3AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAANuSURBVHhe7Z3LaxNRFMbPtEkT0iD43NsiWFGXUkSkUhGRaqvQ4Mb+C4JKuxCJ7UKo+EBcu3HVREUroiCCiCKpOxFaQdo/wCeUNGZM6jhn5qqLIgSc79xMcn6b3LmBfGe+zH19m3HIIiOFiSo5XorI86+iKiX8LY8cdzY3nQ775LFm7HBx3EOLs8WzuctW7rHDfIoyXJyoStwtawSjwgJWjPUHqj/8hQimGnmsGBsOUikktf5iyVjJac/KFGvL2NZHjQUBHyejxfyemlcp+UpGy87Q/DPXeuQlnUz/ndzkm7ADA/SJ9bc6d2v0fY4cx3eTDbVlKmP0/Vq4Jq4t7McAu9PgSWVTmxi3Wht4Mnb9hbmMFNgTWyN/+Dc5qXTiuWlGDnIqsDnuGwVWI9DYtvYV98sjxfE1R57tG10a23WEetbvpVQia3qxuPUyLX17TbffPab3X9aebh+AQhqxfWzfphrl909R3+ZDYqYyrMWagbZfgxRixp7aeZjSiXXmSh7W5hqkEDOWh79tejfsMy08YsZKDv9/0dWZMS08YsbyImKbH6sV08IjZiyvzLZZ/PrKtPCIGVuYn6VqfdlcycPaXIMUYsa+/ZilqZcXaeHTU3JXV0wvHtZiTdbmGqQQPSA0I7E/ILQbaiwINRaEGgtC1FhOty4NDAbt+6PTIp8zxy8EmqwtidiugJOls/2n6dnSFZqZlztaZlMJGupdpoM95+hq6QYtfE6ab0JivyvgZEnaVKbs1gNN1m7ZdOvRor3Y8OGHrGi6pQeEuE8FvIjwfGeLTLKDCify5gqPmLGcbvEiYotj28qtm24Nbj1DJ3dUqLur0/TKwJqs3bLp1rW5m7R7y1G6NXQ+6Gt0L/q/n6zJ2ppuCaLpVsxQY0GosSDUWBCixmq6FQGabgmh6RYITbciQg8IQmi6BULTLRCaboHQdCsidPFSIKixINRYEGosCFFjNd2KAE23hNB0C4SmWxGhBwQhNN0CoekWCE23QGi6FRG6eCkQ1FgQaiwINRaEqLGabkWApltCaLoFQtOtiNADghCaboHQdAuEplsgNN2KCF282hrcfw80NhYPLAycsV4MnAXWCDPWdesHTLMpYUeRNcKMDd6I4Tn3zGXT4fi1od7awcB2Bb8JX42yUvL/Q7hWY/z0ktQNfokP0S9AcG1Llwp+vgAAAABJRU5ErkJggg==`;
      case "battery-5":
        return `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFYAAABWCAYAAABVVmH3AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAALgSURBVHhe7d1PS1RRGAbw96pTokPQH9qnBBXROiJoSBdSlhY4tekzBBa6iJA2wUQJ4tqNK2da5ETtKhREatnGFqEfIKIghmiY0dt97z0k7YrO8547+fw213MFz5ln5t4z99kYSUDj1em2RHG3SJyMfC0l+1uxRNv1cqUnO2cvWLBjtakYPblGXC8/CvIau9zR1Fhtum3xanWO9KoIIEiwyYWaXP5G0luNvSDBZhepFcu5dgUK1vK2F+QWGyrY/x+DBYFfJxO1BxdacWNld6Ywl+ave21yKETF0tPyzGp2AgP6KpOvOq+TXfmiG+ZLHL1ZvlEZciPvYLcC/aTmNlSVrG1kcfKSG3kHC7YlyeWfc7293S/dj95x8wIBBhtqk/obuDWafmJPHG7Kw1K2XzybqJgcl67dT+fUuS3B3rLx2tRvz5Inj7Tkztnb8mrrsSxt9LmzeMX9PTI6+E2GB+7Kk7dz8uFzwf0mswxqv8w+sbdOj5iHqhrNdjqnzq1rsGIW7MDBc/Ji84Ab2Xv+sSiDh867EZ7ZrSCvOv5WoJuI3u9C6St0SfX6jBvhmQW79XU93URCuXq8IZtf1twIzyzY6kZdho5Nys1T36V/n22pr3Pq3LoGK2bBvv9UlNl383Lm6BVZGL2XnvvT76L/etQ5dW5dgxVuXp2+ee01DBaEwYIwWBDTYNluecB2ywjbLRC2W57wAcEI2y0QtlsgbLdA2G55ws2LIBgsCIMFYbAgpsGy3fKA7ZYRtlsgbLc84QOCEbZbIGy3QNhugbDd8oSbF0EwWBAGC8JgQUyDZbvlAdstI2y3QNhuecIHBCNst0DYboGw3QJhu+UJNy+CYLAgDBaEwYKYBst2ywO2W0bYboGw3fKEDwhG2G6BsN0CYbsFwnbLE25eexruvQcG2xEfWBhcsJ2QK3CNsGB/NLcvux9zSTNFrhG2eSn+SxQQXXhB+ksiO+5MHuyIrgkZqojITyBXj8U3F6BiAAAAAElFTkSuQmCC`;
      case "grid":
        return `data:image/png;base64,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`;
      case "home-normal":
        return `data:image/png;base64,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`;
      case "inverter":
        return `data:image/png;base64,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`;
      case "solar":
        return `data:image/png;base64,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`;
      default:
        return ``;
    }
  }

  getBatteryLevel(battery_soc) {
    if (battery_soc == 100) {
      return "battery-5";
    } else if (battery_soc >= 80) {
      return "battery-4";
    } else if (battery_soc >= 60) {
      return "battery-3";
    } else if (battery_soc >= 40) {
      return "battery-2";
    } else if (battery_soc >= 20) {
      return "battery-1";
    } else {
      return "battery-0";
    }
  }

  getConfigEntityState(config_entity) {
    const entity = this._hass.states[this.config[config_entity].entity];

    if (entity.state === "unavailable" || entity.state === "unknown") {
      return "-";
    } else if (isNaN(entity.state)) {
      return entity.state;
    } else {
      return entity.state;
    }
  }

  getConfigEntityAttribute(config_entity, attribute_name) {
    const entity = this._hass.states[this.config[config_entity].entity];

    if (entity.attributes && entity.attributes[attribute_name]) {
      return entity.attributes[attribute_name];
    } else {
      return "-";
    }
  }

  getConfigEntityUnit(config_entity) {
    const entity = this._hass.states[this.config[config_entity].entity];

    if (isNaN(entity.state)) return "-";
    else return entity.attributes.unit_of_measurement ?? "";
  }

  getAllocatedPower() {
    let allocatedEnergy = 0;
    for (let i = 0; i < this.config["energy_allocations"].entities.length; i++) {
      let entity = this._hass.states[this.config["energy_allocations"].entities[i]];
      let entity_value = entity.state;
      let entity_unit = entity.attributes.unit_of_measurement;
      if (entity_value === "unavailable" || entity_value === "unknown") {
        entity_unit = "nan";
      }
      if (entity_unit == "W") {
        allocatedEnergy += parseFloat(entity_value);
      } else if (entity_unit == "kW") {
        allocatedEnergy += parseFloat(entity_value) * 1000;
      }
    }
    return allocatedEnergy;
  }

  formatPowerStates(config_entity) {
    const unit = this.getConfigEntityUnit(config_entity);
    var state = this.getConfigEntityState(config_entity);
    if (unit == "W") {
      return `${Math.abs(parseInt(state))} ${unit}`;
    } else if (unit == "kW") {
      return `${Math.abs(parseInt(state)) * 1000} W`;
    }
  }

  bindRefresh(card, hass, config) {
    let refresh_button_left = card.querySelector("#refresh-button-left");
    if (refresh_button_left) {
      refresh_button_left.addEventListener("click", function (source) {
        hass.callService("luxpower", "luxpower_refresh_registers", { dongle: config.lux_dongle });
      });
    }
    let refresh_button_right = card.querySelector("#refresh-button-right");
    if (refresh_button_right) {
      refresh_button_right.addEventListener("click", function (source) {
        hass.callService("luxpower", "luxpower_refresh_registers", { dongle: config.lux_dongle });
      });
    }
  }

  bindHistoryGraph(card, hass, config) {
    const history_map = {
      "#solar-image": "pv_power",
      "#battery-image": "battery_soc",
      "#grid-image": "grid_flow",
      "#home-image": "home_consumption",
    };

    for (const [key, value] of Object.entries(history_map)) {
      if (history_map.hasOwnProperty(key)) {
        let button_element = card.querySelector(key);
        if (button_element) {
          button_element.addEventListener("click", function (source) {
            const event = new Event("hass-more-info", {
              bubbles: true,
              cancelable: false,
              composed: true,
            });
            event.detail = {
              entityId: config[value].entity,
            };
            card.dispatchEvent(event);
            return event;
          });
        }
      }
    }
  }
}

customElements.define("lux-power-distribution-card", LuxPowerDistributionCard);
