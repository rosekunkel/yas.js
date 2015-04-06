$(document).ready(function () {
    var editor = ace.edit("editor");
    var assembledCode = null;
    var vm = null;
    var renderHex = false;

    // Takes an assembled code array produced by Yas.assemble and fills a table
    // with the id "code" with it, one row per line
    function renderCodeAsTable(code) {
        // Add headers
        $('#code').empty()
            .append($('<thead />')
                    .append($('<tr />')
                            .append($('<th />').text('#'))
                            .append($('<th />').text('Address'))
                            .append($('<th />').text('Opcode'))
                            .append($('<th />').text('Source'))))
            .append($('<tbody/>'));

        // Takes an array of bytes and produces a string representation of it in
        // hexadecimal
        function opcodeArrayToString(opcodeArray) {
            var str = '';

            opcodeArray.forEach(function (entry) {
                var hexRepresentation = entry.toString(16);
                if (hexRepresentation.length === 1) {
                    hexRepresentation = '0' + hexRepresentation;
                }
                str += hexRepresentation;
            });

            return str;
        }

        // Go through each line and add a row to the table
        code.forEach(function (line, index) {
            var row = $('<tr />');
            var lineNumber = $('<td />')
                .attr('class', 'assembledLineNum')
                .text((index + 1).toString());
            var address = $('<td />')
                .attr('class', 'assembledAddress')
                .text('0x' + line.address.toString(16));
            var opcode = $('<td />').attr('class', 'assembledOpcode');

            if (line.opcode !== null) {
                opcode.text('0x' + opcodeArrayToString(line.opcode));
            }

            var source = $('<td />')
                .attr('class', 'assembledSource')
                .append($('<code />').text(line.source));
            row = row
                .append(lineNumber)
                .append(address)
                .append(opcode)
                .append(source);
            $('#code > tbody').append(row);
        });
    }

    // Search through the table and highlight the line with the given address
    function highlightLine(addr) {
        $('.highlightedLine').removeClass('highlightedLine');

        $('#code tr').filter(function () {
            return ($('.assembledAddress', this).text() ===
                    '0x' + addr.toString(16));
        }).last().addClass('highlightedLine');

        // Scroll to the highlighted line if it's not in view
        if ($('.highlightedLine').length !== 0) {
            $('#codeContainer').scrollTo($('.highlightedLine'), {
                offset : -80
            });
        }
    }

    // Convert a number to either a hexadecimal or decimal number, based on the
    // value of the renderHex variable
    function numToPreferredString(num) {
        if (renderHex) {
            return '0x' + num.toString(16);
        } else {
            return num.toString(10);
        }
    }

    // Replace the contents of any element with the refreshSVG class with its
    // own content to force the browser to re-render any SVGs inside
    function refreshSVG() {
        $('.refreshSVG').each(function () {
            $(this).html($(this).html());
        });
    }

    // Calculate the maximum width of all of the strings passed, rendered in SVG
    // with the given attributes
    function calcMaxTextWidth(strings, attributes) {
        // We first check cached values, because we don't want to recalculate
        // something we've already calculated
        this.cache = this.cache || {};
        var key = JSON.stringify(Array.prototype.slice.call(arguments));

        if (this.cache[key] !== undefined) {
            return this.cache[key];
        }

        // Make a temporary div at the end of the body to do work with
        var max = 0;
        $('<div />').attr({
            'id' : 'calcTextWidthTempDiv',
            'class' : 'refreshSVG'
        }).appendTo('body');

        // Put an SVG in our temporary div
        $('<svg />')
            .attr('id', 'calcTextWidthTempSVG')
            .appendTo($('#calcTextWidthTempDiv'));

        // Render each string as a text element in our SVG and calculate its
        // length
        strings.forEach(function (str) {
            $('<text />')
                .attr('id', 'calcTextWidthTempText')
                .attr(attributes)
                .append(str)
                .appendTo($('#calcTextWidthTempSVG'));

            refreshSVG(); // We have to refresh the rendering to get good data

            var textWidth = $('#calcTextWidthTempText').get(0)
                .getComputedTextLength();

            // Compare to the current maximum
            max = textWidth > max ? textWidth : max;

            // Clean up the temporary text
            $('#calcTextWidthTempText').remove();
        });

        // Clean up our temporary div
        $('#calcTextWidthTempDiv').remove();

        // Store the value for future calls
        this.cache[key] = max;
        return max;
    }

    // Create an SVG element which represets a memory cell with the given
    // address and data
    function makeMemCell(addr, data) {
        var boxHeight = 30;
        var boxWidth = 200;
        var addressPadding = 10;

        // How much we need to shift the text down so that our y-position
        // represents the center of the text
        var textVerticalCenterCorrection = 6.5;

        // We are going to be printing 4-digit numbers. Because one of the
        // digits must be the widest digit, one of these has to be the
        // widest 4-digit number (mod kerning).
        var maxAddressTextLen = calcMaxTextWidth(['0x0000', '0x1111', '0x2222',
                                                  '0x3333', '0x4444', '0x5555',
                                                  '0x6666', '0x7777', '0x8888',
                                                  '0x9999', '0xaaaa', '0xbbbb',
                                                  '0xcccc', '0xdddd', '0xeeee',
                                                  '0xffff'], {});

        var addressText = $('<text />').attr({
            'x' : maxAddressTextLen,
            'y' : boxHeight + textVerticalCenterCorrection,
            'text-anchor' : 'end'
        }).text(addr);

        var box = $('<rect />').attr({
            'x' : maxAddressTextLen + addressPadding,
            'y' : 1,
            'width' : boxWidth,
            'height' : boxHeight,
            'fill' : 'none',
            'stroke' : 'black' });

        var dataText = $('<text />').attr({
            'x' : maxAddressTextLen + addressPadding + boxWidth/2,
            'y' : boxHeight/2 + textVerticalCenterCorrection,
            'text-anchor' : 'middle'
        }).text(data);

        return $('<svg />')
            .append(box)
            .append(addressText)
            .append(dataText);
    }

    // Create an SVG element representing a register with the given name and
    // data. If labelAbove is true, the register name will be placed above the
    // data instead of to the left.
    function makeRegister(reg, data, labelAbove) {
        var boxHeight = 30;
        var boxWidth = 100;
        var labelPadding = 10;
        var boxVerticalOffset = 11;
        var textVerticalCenterCorrection = 6;
        var textVerticalTopCorrection = 13;

        // We are going to be printing 4-digit numbers. Because one of the
        // digits must be the widest digit, one of these has to be the
        // widest 4-digit number (mod kerning).
        var maxLabelLen = calcMaxTextWidth(['%eax','%ebx', '%ecx',
                                            '%edx', '%edi', '%esi',
                                            '%ebp', '%esp', 'PC'], {});

        var labelText = $('<text />').attr({
            'x' : labelAbove ? boxWidth/2 : maxLabelLen,
            'y' : labelAbove ? 1 + textVerticalTopCorrection : boxHeight/2 + textVerticalCenterCorrection,
            'text-anchor' : labelAbove ? 'middle' : 'end'
        }).text(reg);

        var box = $('<rect />').attr({
            'x' : labelAbove ? 1 : maxLabelLen + labelPadding,
            'y' : labelAbove ?  textVerticalTopCorrection + boxVerticalOffset + 1 : 1,
            'width' : boxWidth,
            'height' : boxHeight,
            'fill' : 'none',
            'stroke' : 'black' });

        var dataText = $('<text />').attr({
            'x' : labelAbove ? boxWidth/2 : maxLabelLen + labelPadding + boxWidth/2,
            'y' : (labelAbove ? boxHeight/2 + boxVerticalOffset + textVerticalTopCorrection : boxHeight/2) + textVerticalCenterCorrection,
            'text-anchor' : 'middle'
        }).text(data);

        return $('<svg />')
            .append(box)
            .append(labelText)
            .append(dataText);
    }

    // Update the memory diagram to match the current state of a provided
    // virtual machine
    function updateVisualization(virtualMachine) {
        // Clear out the current diagram
        $('#memoryDiagram').empty();

        // Definition section
        // Make an arrowhead that can be added to paths
        $('#memoryDiagram').append($('<defs />').append($('<marker />').attr({
            'id' : 'markerArrowhead',
            'markerWidth' : 6,
            'markerHeight' : 10,
            'refx' : 6,
            'refy' : 5,
            'orient' : 'auto'
        }).append($('<path />').attr({
            'd' : 'M0,0 L6,5 L0,10',
            'fill' : 'none',
            'stroke' : 'black'
        }))));

        // Draw memory
        var numMemoryCells = 5;

        if (virtualMachine.registers['%esp'] !== 0) {
            numMemoryCells = (0x1000 - virtualMachine.registers['%esp'])/4 + 5;
        }

        for (var i = 0; i < numMemoryCells; ++i) {
            var addr = 0x1000 - 4*(numMemoryCells - i);
            var cell =
                makeMemCell(numToPreferredString(addr + 4),
                            numToPreferredString(
                                virtualMachine.getIntAt(addr)));
            $('#memoryDiagram').append(cell.attr({
                'x' : 190,
                'y' : 30 * i + (11 + 13)
            }));
        }

        // Draw the registers on the right hand side of the diagram
        var rightHandRegisters = ['%eax', '%ebx', '%ecx',
                                  '%edx', '%edi', '%esi'];

        rightHandRegisters.forEach(function (register, index) {
            var reg =
                makeRegister(register,
                             numToPreferredString(
                                 virtualMachine.registers[register]));
            $('#memoryDiagram').append(reg.attr({
                'x' : 500,
                'y' : (30 + 15) * index + (11 + 13),
            }));
        });

        // Draw the program counter
        $('#memoryDiagram')
            .append(makeRegister('PC',
                                 numToPreferredString(
                                     virtualMachine.programCounter),
                                 true).attr({
            'x' : 680,
            'y' : 0,
        }));

        // Draw the status indicator
        $('#memoryDiagram')
            .append(makeRegister('Status',
                                 virtualMachine.statusCode,
                                 true).attr({
            'x' : 680,
            'y' : 90,
        }));

        // Draw the %esp register
        var espx = 0;
        var espy = 135;
        var addressLen = calcMaxTextWidth(['0x0000', '0x1111', '0x2222',
                                           '0x3333', '0x4444', '0x5555',
                                           '0x6666', '0x7777', '0x8888',
                                           '0x9999', '0xaaaa', '0xbbbb',
                                           '0xcccc', '0xdddd', '0xeeee',
                                           '0xffff'], {}) + 10;
        var espStartpointX = espx + 100;
        var espStartpointY = espy + (11 + 13 + 1) + 30/2;
        var espEndpointX = 190 + addressLen;
        var espEndpointY = (30 * (virtualMachine.registers['%esp']/4 -
                                  (0x1000/4 - numMemoryCells)) + (11 + 13 + 1));

        $('#memoryDiagram')
            .append(makeRegister('%esp',
                                 numToPreferredString(
                                     virtualMachine.registers['%esp']),
                                 true).attr({
            'x' : espx,
            'y' : espy,
        }));

        // Draw the arrow from the %esp register to the current memory address
        if (virtualMachine.registers['%esp'] !== 0) {
            $('#memoryDiagram').append($('<path />').attr({
                'd' : 'M' + espStartpointX + ',' + espStartpointY + ' ' +
                    'C' + (espStartpointX + 80) + ',' + espStartpointY + ' ' +
                    (espEndpointX - 80) + ',' + espEndpointY + ' ' +
                    espEndpointX + ',' + espEndpointY,
                'fill' : 'none',
                'stroke' : 'black',
                'style' : 'marker-end: url(#markerArrowhead)'
            }));
        }

        // Draw the %ebp register
        var ebpx = 0;
        var ebpy = 45;
        var ebpStartpointX = ebpx + 100;
        var ebpStartpointY = ebpy + (11 + 13 + 1) + 30/2;
        var ebpEndpointX = 190 + addressLen;
        var ebpEndpointY = (30 * (virtualMachine.registers['%ebp']/4 -
                                  (0x1000/4 - numMemoryCells)) + (11 + 13 + 1));

        $('#memoryDiagram')
            .append(makeRegister('%ebp',
                                 numToPreferredString(
                                     virtualMachine.registers['%ebp']),
                                 true).attr({
            'x' : ebpx,
            'y' : ebpy,
        }));

        // Draw the arrow from the %ebp register to the current memory address
        if (virtualMachine.registers['%ebp'] !== 0) {
            $('#memoryDiagram').append($('<path />').attr({
                'd' : 'M' + ebpStartpointX + ',' + ebpStartpointY + ' ' +
                    'C' + (ebpStartpointX + 80) + ',' + ebpStartpointY + ' ' +
                    (ebpEndpointX - 80) + ',' + ebpEndpointY + ' ' +
                    ebpEndpointX + ',' + ebpEndpointY,
                'fill' : 'none',
                'stroke' : 'black',
                'style' : 'marker-end: url(#markerArrowhead)'
            }));
        }

        // Highlight the current line in the code
        highlightLine(virtualMachine.programCounter);

        // Update the SVG rendering
        refreshSVG();

        // Update the size of the diagram to fit everything in the SVG
        var bbox = $('#memoryDiagram').get(0).getBBox();
        $('#memoryDiagram').attr({
            'width' : bbox.x + bbox.width + 1,
            'height' : bbox.y + bbox.height + 1,
        });
    }

    // Bind the assemble button to assembling the code
    $('body').on('click', '#assemble', function (event) {
        $('#preAssemble').hide();
        $('#postAssemble').show();
        try {
            assembledCode = Yas.assemble(editor.getValue());
        } catch (e) {
            if (e instanceof Yas.ParseException) {
                console.log(e.message);
            }
            throw e;
        }
        renderCodeAsTable(assembledCode);
        vm = new Yas.VM(assembledCode, function () {
            return prompt("The program needs input.");});
        console.log(vm);
        updateVisualization(vm);
    });

    // Bind the advance button to advancing the VM and updating the diagram
    $('body').on('click', '#advance', function (event) {
        vm.advance();

        updateVisualization(vm);

        $('#output').text(vm.output);
    });

    // Bind the toggleHex button to changing whether hex or decimal numbers are
    // shown in the diagram
    $('body').on('click', '#toggleHex', function (event) {
        renderHex = !renderHex;

        $('#toggleHex').text(renderHex ? 'Decimal' : 'Hexadecimal');

        updateVisualization(vm);
    });

    // Bind the edit button to re-show the editor
    $('body').on('click', '#edit', function (event) {
            $('#preAssemble').show();
            $('#postAssemble').hide();
    });

    // Bind the clear button to clear the editor
    $('body').on('click', '#clear', function (event) {
        editor.setValue('');
    });

    // Show only the editor on page load
    $('#postAssemble').hide();
});
